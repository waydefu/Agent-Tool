Set sh = CreateObject("WScript.Shell")
dir = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)
sh.Run """C:\Program Files\nodejs\node.exe"" """ & dir & "\launch-zh-tw.js"" --lang=en", 0, False
