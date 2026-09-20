using Playnite.SDK;
using Playnite.SDK.Data;
using System;
using System.Collections.Generic;
using System.Security.Cryptography;
using System.Text;

namespace GamingStatsSync
{
    public sealed class GamingStatsSyncSettings : ObservableObject, ISettings
    {
        private readonly GamingStatsSyncPlugin plugin;
        private GamingStatsSyncSettings editingClone;
        private string endpointUrl = "https://api.aniketraj.me";
        private string deviceName = Environment.MachineName;
        private bool includeHiddenGames;
        private bool syncArtwork = true;

        public string EndpointUrl { get => endpointUrl; set => SetValue(ref endpointUrl, value); }
        public string DeviceName { get => deviceName; set => SetValue(ref deviceName, value); }
        public bool IncludeHiddenGames { get => includeHiddenGames; set => SetValue(ref includeHiddenGames, value); }
        public bool SyncArtwork { get => syncArtwork; set => SetValue(ref syncArtwork, value); }
        public string DeviceId { get; set; } = Guid.NewGuid().ToString();
        public string ProtectedUploadKey { get; set; }

        [DontSerialize]
        public string UploadKey { get; set; }

        public GamingStatsSyncSettings()
        {
        }

        public GamingStatsSyncSettings(GamingStatsSyncPlugin plugin)
        {
            this.plugin = plugin;
            var saved = plugin.LoadPluginSettings<GamingStatsSyncSettings>();
            if (saved != null)
            {
                EndpointUrl = saved.EndpointUrl;
                DeviceName = saved.DeviceName;
                IncludeHiddenGames = saved.IncludeHiddenGames;
                SyncArtwork = saved.SyncArtwork;
                DeviceId = string.IsNullOrWhiteSpace(saved.DeviceId) ? Guid.NewGuid().ToString() : saved.DeviceId;
                ProtectedUploadKey = saved.ProtectedUploadKey;
            }
            UploadKey = Unprotect(ProtectedUploadKey);
        }

        public void BeginEdit()
        {
            editingClone = Clone();
        }

        public void CancelEdit()
        {
            if (editingClone == null) return;
            EndpointUrl = editingClone.EndpointUrl;
            DeviceName = editingClone.DeviceName;
            IncludeHiddenGames = editingClone.IncludeHiddenGames;
            SyncArtwork = editingClone.SyncArtwork;
            DeviceId = editingClone.DeviceId;
            ProtectedUploadKey = editingClone.ProtectedUploadKey;
            UploadKey = editingClone.UploadKey;
        }

        public void EndEdit()
        {
            ProtectedUploadKey = Protect(UploadKey);
            plugin.SavePluginSettings(this);
            editingClone = null;
        }

        public bool VerifySettings(out List<string> errors)
        {
            errors = new List<string>();
            if (!Uri.TryCreate(EndpointUrl, UriKind.Absolute, out var endpoint) || endpoint.Scheme != Uri.UriSchemeHttps ||
                !string.IsNullOrEmpty(endpoint.UserInfo) || !string.IsNullOrEmpty(endpoint.Query) || !string.IsNullOrEmpty(endpoint.Fragment) ||
                endpoint.AbsolutePath != "/")
            {
                errors.Add("API URL must be an HTTPS origin without credentials, query parameters, or fragments.");
            }
            if (string.IsNullOrWhiteSpace(DeviceName) || DeviceName.Length > 128) errors.Add("Device name must contain 1 to 128 characters.");
            if (string.IsNullOrWhiteSpace(UploadKey) || UploadKey.Length < 32 || UploadKey.Length > 512)
            {
                errors.Add("Upload key must contain 32 to 512 characters.");
            }
            return errors.Count == 0;
        }

        public bool IsConfigured => Uri.TryCreate(EndpointUrl, UriKind.Absolute, out var uri) && uri.Scheme == Uri.UriSchemeHttps &&
            uri.AbsolutePath == "/" && string.IsNullOrEmpty(uri.UserInfo) && string.IsNullOrEmpty(uri.Query) && string.IsNullOrEmpty(uri.Fragment) &&
            !string.IsNullOrWhiteSpace(UploadKey) && UploadKey.Length >= 32;

        private GamingStatsSyncSettings Clone() => new GamingStatsSyncSettings
        {
            EndpointUrl = EndpointUrl,
            DeviceName = DeviceName,
            IncludeHiddenGames = IncludeHiddenGames,
            SyncArtwork = SyncArtwork,
            DeviceId = DeviceId,
            ProtectedUploadKey = ProtectedUploadKey,
            UploadKey = UploadKey,
        };

        private static string Protect(string value)
        {
            if (string.IsNullOrEmpty(value)) return null;
            var bytes = Encoding.UTF8.GetBytes(value);
            return Convert.ToBase64String(ProtectedData.Protect(bytes, null, DataProtectionScope.CurrentUser));
        }

        private static string Unprotect(string value)
        {
            if (string.IsNullOrEmpty(value)) return string.Empty;
            try
            {
                var bytes = ProtectedData.Unprotect(Convert.FromBase64String(value), null, DataProtectionScope.CurrentUser);
                return Encoding.UTF8.GetString(bytes);
            }
            catch
            {
                return string.Empty;
            }
        }
    }
}
