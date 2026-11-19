' 以隱藏視窗執行同資料夾的 launch-zh-tw.js（桌面捷徑指向本檔）。
Set sh = CreateObject("WScript.Shell")
dir = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)
sh.Run """C:\Program Files\nodejs\node.exe"" """ & dir & "\launch-zh-tw.js""", 0, False
