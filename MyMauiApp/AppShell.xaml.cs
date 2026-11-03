namespace MyMauiApp;

public partial class AppShell : Shell
{
	public AppShell(MainPage mainPage)
	{
		InitializeComponent();
		MainShellContent.Content = mainPage;
	}
}
