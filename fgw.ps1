Add-Type @"
  using System;
  using System.Runtime.InteropServices;
  public class Tricks {
    [DllImport("user32.dll")]
    public static extern IntPtr GetForegroundWindow();
}
"@

#$a = [tricks]::GetForegroundWindow()

get-process | Select-Object -ExpandProperty Path