using System.Windows;
using System.Windows.Controls;

namespace GamingStatsSync
{
    public partial class GamingStatsSyncSettingsView : UserControl
    {
        private bool loading;

        public GamingStatsSyncSettingsView()
        {
            InitializeComponent();
            DataContextChanged += OnDataContextChanged;
        }

        private void OnDataContextChanged(object sender, DependencyPropertyChangedEventArgs args)
        {
            loading = true;
            UploadKeyBox.Password = (args.NewValue as GamingStatsSyncSettings)?.UploadKey ?? string.Empty;
            loading = false;
        }

        private void UploadKeyBox_OnPasswordChanged(object sender, RoutedEventArgs args)
        {
            if (!loading && DataContext is GamingStatsSyncSettings settings) settings.UploadKey = UploadKeyBox.Password;
        }
    }
}
