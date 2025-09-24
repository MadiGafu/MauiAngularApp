using Foundation;

namespace MyMauiApp;

[Register("AppDelegate")]
public class AppDelegate : MauiUIApplicationDelegate
{
    protected override Microsoft.Maui.Hosting.MauiApp CreateMauiApp() 
        => MauiProgram.CreateMauiApp();
}
