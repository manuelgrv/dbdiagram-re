# Ready-to-run Windows build

This directory intentionally includes a portable Windows x64 build as a regular Git file, so cloning/pulling the repository also retrieves the build. It does not require Git LFS or downloading a GitHub Release asset separately. Other generated output stays ignored under `dist/` and `artifacts/`.

From the repository root on Windows (PowerShell):

```powershell
git pull
Expand-Archive -LiteralPath .\downloads\DBML-Studio-windows-x64.zip -DestinationPath .\dist\from-git-windows -Force
& '.\dist\from-git-windows\DBML Studio\DBML Studio.exe'
```

No Node.js or C++ compiler installation is needed. Keep the entire extracted app directory, including `resources`. Use the tray icon to reopen Studio or Quit. `Check Windows.cmd` is included for a backend smoke check. The build is unsigned, cross-compiled on macOS, and Windows UI execution remains unverified.

`SHA256SUMS.txt` records the archive digest. You can compare it with `Get-FileHash .\downloads\DBML-Studio-windows-x64.zip -Algorithm SHA256`.

To refresh this checked-in build after packaging, copy `dist/DBML-Studio-windows-x64.zip` here, regenerate `SHA256SUMS.txt`, then commit/push these files. Each replaced binary adds to Git history; use releases for normal distribution and update this copy only when needed.
