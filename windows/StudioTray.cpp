#ifndef UNICODE
#define UNICODE
#endif
#ifndef _UNICODE
#define _UNICODE
#endif
#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <shellapi.h>
#include <shlobj.h>
#include <shobjidl.h>
#include <string>
#include <thread>
#include <fstream>
#include <filesystem>

namespace fs = std::filesystem;
const wchar_t* CLASS_NAME = L"LocalDBMLStudioTray";
constexpr UINT TRAY = WM_APP + 1, LINE = WM_APP + 2, EXITED = WM_APP + 3, OPEN = WM_APP + 4;
constexpr UINT CMD_OPEN = 100, CMD_QUIT = 101;
HWND windowHandle;
HANDLE worker = nullptr, job = nullptr, input = nullptr;
NOTIFYICONDATAW tray{};
std::wstring address, workspace;
fs::path resources, settings;
bool quitting = false;
std::string logs;

std::wstring wide(const std::string& value) {
    if (value.empty()) return L"";
    int size = MultiByteToWideChar(CP_UTF8, 0, value.data(), (int)value.size(), nullptr, 0);
    std::wstring out(size, 0);
    MultiByteToWideChar(CP_UTF8, 0, value.data(), (int)value.size(), out.data(), size);
    return out;
}
std::string utf8(const std::wstring& value) {
    if (value.empty()) return "";
    int size = WideCharToMultiByte(CP_UTF8, 0, value.data(), (int)value.size(), nullptr, 0, nullptr, nullptr);
    std::string out(size, 0);
    WideCharToMultiByte(CP_UTF8, 0, value.data(), (int)value.size(), out.data(), size, nullptr, nullptr);
    return out;
}
std::string json(const std::string& value) {
    std::string out = "\"";
    for (unsigned char c : value) {
        if (c == '\\' || c == '"') { out += '\\'; out += c; }
        else if (c == '\n') out += "\\n";
        else if (c == '\r') out += "\\r";
        else if (c == '\t') out += "\\t";
        else if (c < 32) { char escape[7]; snprintf(escape, sizeof(escape), "\\u%04x", c); out += escape; }
        else out += c;
    }
    return out + '"';
}
// Workspace messages contain JSON.stringify(path): raw UTF-8, with escaped backslashes/quotes.
std::string jsonString(const std::string& value) {
    if (value.size() < 2 || value.front() != '"' || value.back() != '"') return "";
    std::string out;
    for (size_t i = 1; i + 1 < value.size(); i++) {
        char c = value[i];
        if (c == '\\' && i + 2 < value.size()) {
            c = value[++i];
            if (c == 'n') c = '\n'; else if (c == 'r') c = '\r'; else if (c == 't') c = '\t';
        }
        out += c;
    }
    return out;
}
std::wstring quote(const std::wstring& value) {
    std::wstring out = L"\"";
    size_t slashes = 0;
    for (wchar_t c : value) {
        if (c == L'\\') { slashes++; continue; }
        if (c == L'"') out.append(slashes * 2 + 1, L'\\'); else out.append(slashes, L'\\');
        slashes = 0;
        out += c;
    }
    out.append(slashes * 2, L'\\');
    return out + L'"';
}
void openBrowser() {
    if (!address.empty()) ShellExecuteW(nullptr, L"open", address.c_str(), nullptr, nullptr, SW_SHOWNORMAL);
}
void chooseFolder(const std::string& id) {
    IFileOpenDialog* dialog = nullptr;
    std::wstring selected;
    if (SUCCEEDED(CoCreateInstance(CLSID_FileOpenDialog, nullptr, CLSCTX_INPROC_SERVER, IID_PPV_ARGS(&dialog)))) {
        DWORD options = 0;
        dialog->GetOptions(&options);
        dialog->SetOptions(options | FOS_PICKFOLDERS | FOS_FORCEFILESYSTEM | FOS_PATHMUSTEXIST);
        dialog->SetTitle(L"Choose your DBML workspace");
        IShellItem* initial = nullptr;
        if (SUCCEEDED(SHCreateItemFromParsingName(workspace.c_str(), nullptr, IID_PPV_ARGS(&initial)))) { dialog->SetFolder(initial); initial->Release(); }
        if (SUCCEEDED(dialog->Show(windowHandle))) {
            IShellItem* item = nullptr;
            if (SUCCEEDED(dialog->GetResult(&item))) {
                PWSTR path = nullptr;
                if (SUCCEEDED(item->GetDisplayName(SIGDN_FILESYSPATH, &path))) { selected = path; CoTaskMemFree(path); }
                item->Release();
            }
        }
        dialog->Release();
    }
    const auto reply = "{\"id\":" + json(id) + ",\"directory\":" + json(utf8(selected)) + "}\n";
    DWORD written;
    if (input) WriteFile(input, reply.data(), (DWORD)reply.size(), &written, nullptr);
}
void stopWorker() {
    if (input) { CloseHandle(input); input = nullptr; } // stdin EOF triggers graceful Node shutdown.
    if (worker) { if (WaitForSingleObject(worker, 4000) == WAIT_TIMEOUT && job) TerminateJobObject(job, 0); CloseHandle(worker); worker = nullptr; }
    if (job) { CloseHandle(job); job = nullptr; }
}
void processLine(const std::string& line) {
    if (line.rfind("DBML Studio: ", 0) == 0) {
        address = wide(line.substr(13));
        openBrowser();
    } else if (line.rfind("DBML Pick Workspace: ", 0) == 0) chooseFolder(line.substr(21));
    else if (line.rfind("DBML Workspace: ", 0) == 0) {
        workspace = wide(jsonString(line.substr(16)));
        std::ofstream file(settings, std::ios::binary); file << utf8(workspace);
    }
}
bool startWorker() {
    SetEnvironmentVariableW(L"DBDIAGRAM_EXTENSION_DIR", (resources / L"extension").c_str());
    SetEnvironmentVariableW(L"ACORN_PATH", (resources / L"vendor/acorn.cjs").c_str());
    SetEnvironmentVariableW(L"DBML_NATIVE_HOST", L"1");
    SetEnvironmentVariableW(L"NODE_OPTIONS", nullptr);
    SetEnvironmentVariableW(L"NODE_PATH", nullptr);
    SECURITY_ATTRIBUTES security{sizeof(security), nullptr, TRUE};
    HANDLE outputRead = nullptr, outputWrite = nullptr, inputRead = nullptr;
    if (!CreatePipe(&outputRead, &outputWrite, &security, 0) || !CreatePipe(&inputRead, &input, &security, 0)) return false;
    SetHandleInformation(outputRead, HANDLE_FLAG_INHERIT, 0);
    SetHandleInformation(input, HANDLE_FLAG_INHERIT, 0);
    STARTUPINFOW startup{}; startup.cb = sizeof(startup); startup.dwFlags = STARTF_USESTDHANDLES;
    startup.hStdOutput = outputWrite; startup.hStdError = outputWrite; startup.hStdInput = inputRead;
    PROCESS_INFORMATION process{};
    const auto executable = resources / L"node.exe";
    std::wstring command = quote(executable.wstring()) + L" " + quote((resources / L"project/launch.mjs").wstring()) + L" " + quote(workspace) + L" --headless";
    job = CreateJobObjectW(nullptr, nullptr);
    JOBOBJECT_EXTENDED_LIMIT_INFORMATION limits{}; limits.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
    if (!job || !SetInformationJobObject(job, JobObjectExtendedLimitInformation, &limits, sizeof(limits))) return false;
    BOOL started = CreateProcessW(executable.c_str(), command.data(), nullptr, nullptr, TRUE, CREATE_NO_WINDOW | CREATE_SUSPENDED, nullptr, workspace.c_str(), &startup, &process);
    CloseHandle(outputWrite); CloseHandle(inputRead);
    if (!started) { CloseHandle(outputRead); return false; }
    worker = process.hProcess;
    if (!AssignProcessToJobObject(job, worker)) { TerminateProcess(worker, 1); CloseHandle(process.hThread); CloseHandle(outputRead); return false; }
    ResumeThread(process.hThread); CloseHandle(process.hThread);
    std::thread([outputRead] {
        char buffer[4096]; DWORD read; std::string pending;
        while (ReadFile(outputRead, buffer, sizeof(buffer), &read, nullptr) && read) {
            pending.append(buffer, read);
            size_t newline;
            while ((newline = pending.find('\n')) != std::string::npos) {
                auto line = pending.substr(0, newline); pending.erase(0, newline + 1);
                if (!line.empty() && line.back() == '\r') line.pop_back();
                auto message = new std::string(std::move(line));
                if (!PostMessageW(windowHandle, LINE, 0, reinterpret_cast<LPARAM>(message))) delete message;
            }
            if (pending.size() > 65536) pending.erase(0, pending.size() - 65536);
        }
        CloseHandle(outputRead);
        PostMessageW(windowHandle, EXITED, 0, 0);
    }).detach();
    return true;
}
LRESULT CALLBACK procedure(HWND hwnd, UINT message, WPARAM wparam, LPARAM lparam) {
    if (message == OPEN) { openBrowser(); return 0; }
    if (message == LINE) {
        auto line = reinterpret_cast<std::string*>(lparam);
        logs += *line + "\n"; if (logs.size() > 16000) logs.erase(0, logs.size() - 16000);
        processLine(*line); delete line; return 0;
    }
    if (message == EXITED && !quitting) {
        MessageBoxW(hwnd, wide(logs).c_str(), L"DBML Studio server stopped", MB_OK | MB_ICONERROR);
        SendMessageW(hwnd, WM_CLOSE, 0, 0); return 0;
    }
    if (message == TRAY) {
        if (lparam == WM_LBUTTONDBLCLK) openBrowser();
        if (lparam == WM_RBUTTONUP || lparam == WM_LBUTTONUP) {
            HMENU menu = CreatePopupMenu();
            AppendMenuW(menu, MF_STRING | MF_DISABLED, 0, L"DBML Studio");
            AppendMenuW(menu, MF_STRING | (address.empty() ? MF_GRAYED : 0), CMD_OPEN, L"Open Studio");
            AppendMenuW(menu, MF_SEPARATOR, 0, nullptr);
            AppendMenuW(menu, MF_STRING, CMD_QUIT, L"Quit DBML Studio");
            POINT point; GetCursorPos(&point); SetForegroundWindow(hwnd);
            UINT action = TrackPopupMenu(menu, TPM_RETURNCMD | TPM_RIGHTBUTTON, point.x, point.y, 0, hwnd, nullptr);
            DestroyMenu(menu); PostMessageW(hwnd, WM_NULL, 0, 0);
            if (action == CMD_OPEN) openBrowser();
            if (action == CMD_QUIT) SendMessageW(hwnd, WM_CLOSE, 0, 0);
        }
        return 0;
    }
    if (message == WM_CLOSE || message == WM_QUERYENDSESSION) {
        quitting = true; Shell_NotifyIconW(NIM_DELETE, &tray); stopWorker(); DestroyWindow(hwnd); return TRUE;
    }
    if (message == WM_DESTROY) { PostQuitMessage(0); return 0; }
    static UINT taskbarCreated = RegisterWindowMessageW(L"TaskbarCreated");
    if (message == taskbarCreated) { Shell_NotifyIconW(NIM_ADD, &tray); return 0; }
    return DefWindowProcW(hwnd, message, wparam, lparam);
}
int WINAPI wWinMain(HINSTANCE instance, HINSTANCE, PWSTR, int) {
    HANDLE mutex = CreateMutexW(nullptr, FALSE, L"Local\\DBMLStudio.Tray");
    if (!mutex) return 1;
    if (GetLastError() == ERROR_ALREADY_EXISTS) {
        HWND existing = FindWindowW(CLASS_NAME, nullptr);
        if (existing) PostMessageW(existing, OPEN, 0, 0);
        CloseHandle(mutex); return 0;
    }
    CoInitializeEx(nullptr, COINIT_APARTMENTTHREADED);
    wchar_t location[32768]; GetModuleFileNameW(nullptr, location, 32768);
    resources = fs::path(location).parent_path() / L"resources";
    PWSTR local = nullptr;
    if (FAILED(SHGetKnownFolderPath(FOLDERID_LocalAppData, 0, nullptr, &local))) return 1;
    fs::path preferences = fs::path(local) / L"DBML Studio"; CoTaskMemFree(local);
    std::error_code error;
    fs::create_directories(preferences / L"Workspace", error);
    if (error) { MessageBoxW(nullptr, L"Could not create the local workspace.", L"DBML Studio", MB_OK | MB_ICONERROR); return 1; }
    settings = preferences / L"workspace.txt";
    std::ifstream saved(settings, std::ios::binary); std::string previous((std::istreambuf_iterator<char>(saved)), {});
    workspace = wide(previous);
    if (workspace.empty() || !fs::is_directory(workspace, error)) workspace = (preferences / L"Workspace").wstring();
    WNDCLASSW type{}; type.lpfnWndProc = procedure; type.hInstance = instance; type.lpszClassName = CLASS_NAME;
    RegisterClassW(&type);
    windowHandle = CreateWindowExW(0, CLASS_NAME, L"DBML Studio", WS_OVERLAPPED, 0, 0, 0, 0, nullptr, nullptr, instance, nullptr);
    tray.cbSize = sizeof(tray); tray.hWnd = windowHandle; tray.uID = 1; tray.uFlags = NIF_ICON | NIF_MESSAGE | NIF_TIP;
    tray.uCallbackMessage = TRAY; tray.hIcon = LoadIconW(nullptr, IDI_APPLICATION); wcscpy_s(tray.szTip, L"DBML Studio");
    if (!windowHandle || !Shell_NotifyIconW(NIM_ADD, &tray) || !startWorker()) {
        MessageBoxW(nullptr, L"DBML Studio could not start its bundled server. Extract the entire ZIP before launching.", L"DBML Studio", MB_OK | MB_ICONERROR);
        quitting = true; Shell_NotifyIconW(NIM_DELETE, &tray); stopWorker(); CloseHandle(mutex); return 1;
    }
    MSG message{};
    while (GetMessageW(&message, nullptr, 0, 0) > 0) { TranslateMessage(&message); DispatchMessageW(&message); }
    CloseHandle(mutex); CoUninitialize(); return 0;
}
