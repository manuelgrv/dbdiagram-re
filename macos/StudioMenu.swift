import AppKit

final class StudioApp: NSObject, NSApplicationDelegate {
    private var status: NSStatusItem!
    private var worker: Process?
    private var pipe: Pipe?
    private var inputPipe: Pipe?
    private var handledPickerRequests = Set<String>()
    private var url: URL?
    private var workspace: URL?
    private var output = ""
    private var quitting = false
    private var generation = 0
    private let stateItem = NSMenuItem(title: "Starting…", action: nil, keyEquivalent: "")
    private let openItem = NSMenuItem(title: "Open Studio", action: #selector(openStudio), keyEquivalent: "o")

    func applicationDidFinishLaunching(_ notification: Notification) {
        let other = NSRunningApplication.runningApplications(withBundleIdentifier: "local.dbml.studio").contains { $0.processIdentifier != ProcessInfo.processInfo.processIdentifier }
        if other {
            DistributedNotificationCenter.default().postNotificationName(Notification.Name("local.dbml.studio.open"), object: nil)
            NSApp.terminate(nil)
            return
        }
        DistributedNotificationCenter.default().addObserver(self, selector: #selector(openStudio), name: Notification.Name("local.dbml.studio.open"), object: nil)
        status = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
        if let image = NSImage(systemSymbolName: "cylinder.split.1x2", accessibilityDescription: "DBML Studio") {
            image.isTemplate = true
            status.button?.image = image
        } else { status.button?.title = "DBML" }
        status.button?.toolTip = "DBML Studio"
        let menu = NSMenu()
        menu.addItem(NSMenuItem(title: "DBML Studio", action: nil, keyEquivalent: ""))
        menu.addItem(stateItem)
        menu.addItem(.separator())
        openItem.target = self
        openItem.isEnabled = false
        menu.addItem(openItem)
        menu.addItem(.separator())
        let quit = NSMenuItem(title: "Quit DBML Studio", action: #selector(quitApp), keyEquivalent: "q")
        quit.target = self
        menu.addItem(quit)
        menu.autoenablesItems = false
        stateItem.isEnabled = false
        status.menu = menu
        let args = CommandLine.arguments.dropFirst().filter { !$0.hasPrefix("-psn_") }
        if let directory = args.first { start(URL(fileURLWithPath: directory, isDirectory: true)) }
        else if let saved = UserDefaults.standard.string(forKey: "workspace"), FileManager.default.fileExists(atPath: saved) { start(URL(fileURLWithPath: saved, isDirectory: true)) }
        else {
            let initial = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0].appendingPathComponent("DBML Studio/Workspace", isDirectory: true)
            try? FileManager.default.createDirectory(at: initial, withIntermediateDirectories: true)
            start(initial)
        }
    }

    private func stopWorker() {
        pipe?.fileHandleForReading.readabilityHandler = nil
        if let process = worker, process.isRunning {
            process.terminate()
            // Bound shutdown, including outstanding browser/SSE connections.
            let deadline = Date().addingTimeInterval(3)
            while process.isRunning && Date() < deadline { Thread.sleep(forTimeInterval: 0.05) }
            if process.isRunning { kill(process.processIdentifier, SIGKILL) }
            process.waitUntilExit()
        }
        worker = nil
        pipe = nil
        inputPipe = nil
        url = nil
        openItem.isEnabled = false
    }

    private func start(_ directory: URL) {
        generation += 1
        let current = generation
        stopWorker()
        workspace = directory
        output = ""
        stateItem.title = "Starting…"
        guard let resources = Bundle.main.resourceURL else { return }
        let process = Process()
        process.executableURL = resources.appendingPathComponent("node")
        process.arguments = [resources.appendingPathComponent("project/launch.mjs").path, directory.path, "--headless"]
        process.currentDirectoryURL = directory
        var environment = ProcessInfo.processInfo.environment
        environment["DBDIAGRAM_EXTENSION_DIR"] = resources.appendingPathComponent("extension").path
        environment["DBML_NATIVE_HOST"] = "1"
        environment["ACORN_PATH"] = resources.appendingPathComponent("vendor/acorn.cjs").path
        environment.removeValue(forKey: "NODE_OPTIONS")
        environment.removeValue(forKey: "NODE_PATH")
        process.environment = environment
        let stream = Pipe()
        let input = Pipe()
        process.standardInput = input
        inputPipe = input
        process.standardOutput = stream
        process.standardError = stream
        stream.fileHandleForReading.readabilityHandler = { [weak self] handle in
            let data = handle.availableData
            guard !data.isEmpty, let text = String(data: data, encoding: .utf8) else { return }
            DispatchQueue.main.async {
                guard let self = self, self.generation == current else { return }
                self.output += text
                for line in self.output.components(separatedBy: "\n").dropLast() where line.hasPrefix("DBML Pick Workspace: ") {
                    let id = String(line.dropFirst(21))
                    if self.handledPickerRequests.insert(id).inserted {
                        NSApp.activate(ignoringOtherApps: true)
                        let panel = NSOpenPanel()
                        panel.title = "Choose your DBML workspace"
                        panel.canChooseFiles = false
                        panel.canChooseDirectories = true
                        panel.allowsMultipleSelection = false
                        panel.directoryURL = self.workspace
                        panel.begin { response in
                            let selected = response == .OK ? panel.url?.path : nil
                            let reply: [String: Any] = ["id": id, "directory": selected ?? ""]
                            if let data = try? JSONSerialization.data(withJSONObject: reply) {
                                try? self.inputPipe?.fileHandleForWriting.write(contentsOf: data + Data([10]))
                            }
                        }
                    }
                }
                if self.output.count > 16000 { self.output = String(self.output.suffix(16000)) }
                if self.url == nil, let line = self.output.components(separatedBy: "\n").first(where: { $0.hasPrefix("DBML Studio: ") }), let address = URL(string: String(line.dropFirst(13))) {
                    self.url = address
                    self.stateItem.title = directory.lastPathComponent + " · " + (address.port.map(String.init) ?? "")
                    self.status.button?.toolTip = "DBML Studio — " + directory.path
                    self.openItem.isEnabled = true
                    UserDefaults.standard.set(directory.path, forKey: "workspace")
                    self.openStudio()
                }
                if let line = self.output.components(separatedBy: "\n").last(where: { $0.hasPrefix("DBML Workspace: ") }), let data = String(line.dropFirst(16)).data(using: .utf8), let selected = try? JSONDecoder().decode(String.self, from: data) {
                    self.workspace = URL(fileURLWithPath: selected, isDirectory: true)
                    UserDefaults.standard.set(selected, forKey: "workspace")
                    self.stateItem.title = self.workspace!.lastPathComponent + " · " + (self.url?.port.map(String.init) ?? "")
                    self.status.button?.toolTip = "DBML Studio — " + selected
                }
            }
        }
        process.terminationHandler = { [weak self] process in
            DispatchQueue.main.async {
                guard let self = self, self.generation == current, !self.quitting else { return }
                self.url = nil
                self.openItem.isEnabled = false
                self.stateItem.title = "Server stopped (\(process.terminationStatus))"
                let alert = NSAlert()
                alert.messageText = "DBML Studio stopped"
                alert.informativeText = String(self.output.suffix(2000))
                alert.runModal()
            }
        }
        worker = process
        pipe = stream
        do { try process.run() }
        catch {
            worker = nil
            stateItem.title = "Could not start"
            let alert = NSAlert()
            alert.messageText = "DBML Studio could not start"
            alert.informativeText = error.localizedDescription
            alert.runModal()
        }
    }

    @objc func openStudio() { if let address = url { NSWorkspace.shared.open(address) } }
    @objc func quitApp() { NSApp.terminate(nil) }
    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool { openStudio(); return false }
    func applicationWillTerminate(_ notification: Notification) {
        quitting = true
        generation += 1
        stopWorker()
        DistributedNotificationCenter.default().removeObserver(self)
    }
}

// Terminal mode replaces the launcher with the bundled runtime, preserving signals.
if CommandLine.arguments.contains("--headless"), let resources = Bundle.main.resourceURL {
    let node = resources.appendingPathComponent("node").path
    setenv("DBDIAGRAM_EXTENSION_DIR", resources.appendingPathComponent("extension").path, 1)
    setenv("ACORN_PATH", resources.appendingPathComponent("vendor/acorn.cjs").path, 1)
    let args = [node, resources.appendingPathComponent("project/launch.mjs").path] + CommandLine.arguments.dropFirst().filter { $0 != "--headless" }
    var pointers = args.map { strdup($0) }
    pointers.append(nil)
    execv(node, &pointers)
    perror("DBML Studio runtime")
    exit(1)
}

let app = NSApplication.shared
app.setActivationPolicy(.accessory)
let delegate = StudioApp()
app.delegate = delegate
// Route terminal/system termination through the same cleanup as the Quit menu item.
signal(SIGTERM, SIG_IGN)
signal(SIGINT, SIG_IGN)
let termination = DispatchSource.makeSignalSource(signal: SIGTERM, queue: .main)
let interrupt = DispatchSource.makeSignalSource(signal: SIGINT, queue: .main)
termination.setEventHandler { NSApp.terminate(nil) }
interrupt.setEventHandler { NSApp.terminate(nil) }
termination.resume()
interrupt.resume()
app.run()
