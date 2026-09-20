using Playnite.SDK;
using Playnite.SDK.Data;
using Playnite.SDK.Events;
using Playnite.SDK.Models;
using Playnite.SDK.Plugins;
using System;
using System.Collections.Generic;
using System.Drawing;
using System.IO;
using System.Linq;
using System.Net;
using System.Net.Http;
using System.Reflection;
using System.Security.Cryptography;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using System.Windows.Controls;

namespace GamingStatsSync
{
    [LoadPlugin]
    public sealed class GamingStatsSyncPlugin : GenericPlugin
    {
        private const string ExtensionVersion = "1.0.0";
        private static readonly ILogger Logger = LogManager.GetLogger();
        private readonly HttpClient client = new HttpClient { Timeout = TimeSpan.FromSeconds(30) };
        private readonly object sequenceLock = new object();
        private readonly SemaphoreSlim syncLock = new SemaphoreSlim(1, 1);
        private readonly string sequencePath;
        private long sequence;
        private Timer heartbeat;
        private CurrentGameDto currentGame;
        private GamingStatsSyncSettings settings;

        public override Guid Id { get; } = Guid.Parse("a85aec7d-447d-4c0c-9506-f8b27c2ad310");

        public GamingStatsSyncPlugin(IPlayniteAPI api) : base(api)
        {
            Properties = new GenericPluginProperties { HasSettings = true };
            settings = new GamingStatsSyncSettings(this);
            sequencePath = Path.Combine(GetPluginUserDataPath(), "sequence.txt");
            sequence = LoadSequence();
        }

        public override ISettings GetSettings(bool firstRunSettings) => settings;
        public override UserControl GetSettingsView(bool firstRunView) => new GamingStatsSyncSettingsView();

        public override IEnumerable<MainMenuItem> GetMainMenuItems(GetMainMenuItemsArgs args)
        {
            yield return new MainMenuItem
            {
                MenuSection = "@Gaming Stats Sync",
                Description = "Sync now",
                Action = _ => QueueLibrarySync(true),
            };
            yield return new MainMenuItem
            {
                MenuSection = "@Gaming Stats Sync",
                Description = "Connection status",
                Action = _ => ShowStatus(),
            };
        }

        public override void OnApplicationStarted(OnApplicationStartedEventArgs args)
        {
            if (!settings.IsConfigured) return;
            QueuePresence("online", null);
            QueueLibrarySync(false);
        }

        public override void OnApplicationStopped(OnApplicationStoppedEventArgs args)
        {
            StopHeartbeat();
            if (!settings.IsConfigured) return;
            try { SendPresenceAsync(BuildPresence("offline", null)).Wait(TimeSpan.FromSeconds(3)); } catch { }
        }

        public override void OnLibraryUpdated(OnLibraryUpdatedEventArgs args) => QueueLibrarySync(false);
        public override void OnGameInstalled(OnGameInstalledEventArgs args) => QueueLibrarySync(false);
        public override void OnGameUninstalled(OnGameUninstalledEventArgs args) => QueueLibrarySync(false);

        public override void OnGameStarted(OnGameStartedEventArgs args)
        {
            currentGame = new CurrentGameDto
            {
                playniteId = args.Game.Id.ToString(),
                providerGameId = EmptyToNull(args.Game.GameId),
                source = Source(args.Game),
                name = args.Game.Name,
                startedAt = UtcNow(),
            };
            QueuePresence("playing", currentGame);
            heartbeat = new Timer(_ => QueuePresence("playing", currentGame), null, TimeSpan.FromSeconds(60), TimeSpan.FromSeconds(60));
        }

        public override void OnGameStopped(OnGameStoppedEventArgs args)
        {
            StopHeartbeat();
            currentGame = null;
            QueuePresence("online", null);
            QueueLibrarySync(false);
        }

        private void StopHeartbeat()
        {
            heartbeat?.Dispose();
            heartbeat = null;
        }

        private void QueueLibrarySync(bool notify)
        {
            if (!settings.IsConfigured)
            {
                if (notify) PlayniteApi.Dialogs.ShowErrorMessage("Open Add-ons > Extension settings > Generic > Gaming Stats Sync and configure the API URL and upload key.", "Gaming Stats Sync");
                return;
            }
            LibraryDto snapshot;
            try { snapshot = BuildLibrary(); }
            catch (Exception error) { Logger.Error(error, "Could not create Playnite library snapshot."); return; }
            Task.Run(async () =>
            {
                try
                {
                    await syncLock.WaitAsync();
                    try
                    {
                        if (settings.SyncArtwork) await PrepareArtworkAsync(snapshot.games);
                        await PostJsonAsync("/playnite/sync/library", snapshot);
                    }
                    finally { syncLock.Release(); }
                    if (notify) PlayniteApi.Dialogs.ShowMessage($"Synced {snapshot.games.Count} games.", "Gaming Stats Sync");
                }
                catch (Exception error)
                {
                    Logger.Error(error, "Playnite library sync failed.");
                    if (notify) PlayniteApi.Dialogs.ShowErrorMessage("Sync failed. Check the extension log and connection settings.", "Gaming Stats Sync");
                }
            });
        }

        private void QueuePresence(string state, CurrentGameDto game)
        {
            if (!settings.IsConfigured) return;
            var snapshot = BuildPresence(state, game);
            Task.Run(async () =>
            {
                try { await SendPresenceAsync(snapshot); }
                catch (Exception error) { Logger.Error(error, "Playnite presence sync failed."); }
            });
        }

        private async Task SendPresenceAsync(PresenceDto snapshot) => await PostJsonAsync("/playnite/sync/presence", snapshot);

        private LibraryDto BuildLibrary()
        {
            var games = PlayniteApi.Database.Games
                .Where(game => settings.IncludeHiddenGames || !game.Hidden)
                .Select(Game)
                .ToList();
            return new LibraryDto
            {
                deviceId = settings.DeviceId,
                deviceName = settings.DeviceName,
                sequence = NextSequence(),
                generatedAt = UtcNow(),
                playniteVersion = PlayniteApi.ApplicationInfo.ApplicationVersion.ToString(),
                extensionVersion = ExtensionVersion,
                games = games,
            };
        }

        private PresenceDto BuildPresence(string state, CurrentGameDto game) => new PresenceDto
        {
            deviceId = settings.DeviceId,
            deviceName = settings.DeviceName,
            sequence = NextSequence(),
            generatedAt = UtcNow(),
            playniteVersion = PlayniteApi.ApplicationInfo.ApplicationVersion.ToString(),
            extensionVersion = ExtensionVersion,
            state = state,
            currentGame = game,
        };

        private GameDto Game(Game game)
        {
            var release = game.ReleaseDate;
            return new GameDto
            {
                playniteId = game.Id.ToString(),
                providerGameId = EmptyToNull(game.GameId),
                libraryPluginId = game.PluginId == Guid.Empty ? null : game.PluginId.ToString(),
                source = Source(game),
                name = game.Name,
                sortingName = EmptyToNull(game.SortingName),
                playtimeSeconds = game.Playtime > (ulong)long.MaxValue ? long.MaxValue : (long)game.Playtime,
                playCount = game.PlayCount > (ulong)long.MaxValue ? long.MaxValue : (long)game.PlayCount,
                lastActivityAt = Date(game.LastActivity),
                addedAt = Date(game.Added),
                modifiedAt = Date(game.Modified),
                isInstalled = game.IsInstalled,
                isRunning = game.IsRunning,
                hidden = game.Hidden,
                favorite = game.Favorite,
                isCustomGame = game.IsCustomGame,
                installSizeBytes = game.InstallSize.HasValue && game.InstallSize.Value <= 9007199254740991UL ? (long?)game.InstallSize.Value : null,
                releaseDate = release.HasValue ? new ReleaseDateDto { year = release.Value.Year, month = release.Value.Month, day = release.Value.Day } : null,
                completionStatus = game.CompletionStatus?.Name,
                platforms = Names(game.Platforms?.Select(item => item.Name)),
                genres = Names(game.Genres?.Select(item => item.Name)),
                categories = Names(game.Categories?.Select(item => item.Name)),
                tags = Names(game.Tags?.Select(item => item.Name), 500),
                features = Names(game.Features?.Select(item => item.Name)),
                ageRatings = Names(game.AgeRatings?.Select(item => item.Name)),
                regions = Names(game.Regions?.Select(item => item.Name)),
                series = Names(game.Series?.Select(item => item.Name)),
                developers = Names(game.Developers?.Select(item => item.Name)),
                publishers = Names(game.Publishers?.Select(item => item.Name)),
                scores = new ScoresDto { user = game.UserScore, critic = game.CriticScore, community = game.CommunityScore },
                links = (game.Links == null ? Enumerable.Empty<Playnite.SDK.Models.Link>() : game.Links).Take(50).Where(link => IsSafeUrl(link.Url)).Select(link => new LinkDto { name = link.Name, url = link.Url }).ToList(),
                artwork = new ArtworkDto(),
                iconPath = ResolveMedia(game.Icon),
                coverPath = ResolveMedia(game.CoverImage),
                backgroundPath = ResolveMedia(game.BackgroundImage),
            };
        }

        private SourceDto Source(Game game) => new SourceDto
        {
            id = game.SourceId == Guid.Empty ? null : game.SourceId.ToString(),
            name = game.Source?.Name,
        };

        private string ResolveMedia(string reference)
        {
            if (string.IsNullOrWhiteSpace(reference)) return null;
            try
            {
                var path = PlayniteApi.Database.GetFullFilePath(reference);
                return File.Exists(path) ? path : null;
            }
            catch { return null; }
        }

        private async Task PrepareArtworkAsync(IEnumerable<GameDto> games)
        {
            foreach (var game in games)
            {
                game.artwork.icon = await PrepareArtworkAsync(game.iconPath);
                game.artwork.cover = await PrepareArtworkAsync(game.coverPath);
                game.artwork.background = await PrepareArtworkAsync(game.backgroundPath);
            }
        }

        private async Task<ArtworkItemDto> PrepareArtworkAsync(string path)
        {
            if (string.IsNullOrWhiteSpace(path)) return null;
            try
            {
                var info = new FileInfo(path);
                if (!info.Exists || info.Length <= 0 || info.Length > 12 * 1024 * 1024) return null;
                var bytes = File.ReadAllBytes(path);
                var contentType = ImageContentType(bytes);
                if (contentType == null) return null;
                string hash;
                using (var sha = SHA256.Create()) hash = string.Concat(sha.ComputeHash(bytes).Select(value => value.ToString("x2")));
                var exists = await AssetExistsAsync(hash);
                if (!exists) await PutAssetAsync(hash, contentType, bytes);
                int? width = null;
                int? height = null;
                try
                {
                    using (var stream = new MemoryStream(bytes))
                    using (var image = System.Drawing.Image.FromStream(stream, false, true)) { width = image.Width; height = image.Height; }
                }
                catch { }
                return new ArtworkItemDto { assetId = hash, contentType = contentType, width = width, height = height };
            }
            catch (Exception error)
            {
                Logger.Warn(error, "Could not upload Playnite artwork.");
                return null;
            }
        }

        private async Task<bool> AssetExistsAsync(string hash)
        {
            using (var request = Request(HttpMethod.Head, $"/playnite/sync/assets/{hash}"))
            using (var response = await client.SendAsync(request))
            {
                if (response.StatusCode == HttpStatusCode.NotFound) return false;
                response.EnsureSuccessStatusCode();
                return true;
            }
        }

        private async Task PutAssetAsync(string hash, string contentType, byte[] bytes)
        {
            using (var request = Request(HttpMethod.Put, $"/playnite/sync/assets/{hash}"))
            {
                request.Content = new ByteArrayContent(bytes);
                request.Content.Headers.ContentType = new System.Net.Http.Headers.MediaTypeHeaderValue(contentType);
                using (var response = await client.SendAsync(request)) response.EnsureSuccessStatusCode();
            }
        }

        private async Task PostJsonAsync(string path, object payload)
        {
            using (var request = Request(HttpMethod.Post, path))
            {
                request.Content = new StringContent(Serialization.ToJson(payload), Encoding.UTF8, "application/json");
                using (var response = await client.SendAsync(request)) response.EnsureSuccessStatusCode();
            }
        }

        private HttpRequestMessage Request(HttpMethod method, string path)
        {
            var endpoint = settings.EndpointUrl.TrimEnd('/') + path;
            var request = new HttpRequestMessage(method, endpoint);
            request.Headers.Add("X-Playnite-Key", settings.UploadKey);
            request.Headers.UserAgent.ParseAdd($"GamingStatsSync/{ExtensionVersion}");
            return request;
        }

        private void ShowStatus()
        {
            var message = settings.IsConfigured
                ? $"Configured for {settings.EndpointUrl}\nDevice: {settings.DeviceName}\nAutomatic library, artwork, and now-playing sync is enabled."
                : "Not configured. Open the extension settings and enter the API URL and upload key.";
            PlayniteApi.Dialogs.ShowMessage(message, "Gaming Stats Sync");
        }

        private long LoadSequence()
        {
            try
            {
                if (long.TryParse(File.ReadAllText(sequencePath), out var saved)) return Math.Max(saved, DateTimeOffset.UtcNow.ToUnixTimeMilliseconds());
            }
            catch { }
            return DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        }

        private long NextSequence()
        {
            lock (sequenceLock)
            {
                sequence = Math.Max(sequence + 1, DateTimeOffset.UtcNow.ToUnixTimeMilliseconds());
                var temporary = sequencePath + ".tmp";
                File.WriteAllText(temporary, sequence.ToString());
                if (File.Exists(sequencePath)) File.Replace(temporary, sequencePath, null);
                else File.Move(temporary, sequencePath);
                return sequence;
            }
        }

        private static string UtcNow() => DateTime.UtcNow.ToString("o");
        private static string Date(DateTime? value) => value?.ToUniversalTime().ToString("o");
        private static string EmptyToNull(string value) => string.IsNullOrWhiteSpace(value) ? null : value;
        private static List<string> Names(IEnumerable<string> values, int max = 100) => (values ?? Enumerable.Empty<string>()).Where(value => !string.IsNullOrWhiteSpace(value)).Distinct().Take(max).ToList();
        private static bool IsSafeUrl(string value) => Uri.TryCreate(value, UriKind.Absolute, out var uri) && uri.Scheme == Uri.UriSchemeHttps && string.IsNullOrEmpty(uri.UserInfo);

        private static string ImageContentType(byte[] value)
        {
            if (value.Length >= 3 && value[0] == 0xff && value[1] == 0xd8 && value[2] == 0xff) return "image/jpeg";
            if (value.Length >= 8 && value[0] == 0x89 && Encoding.ASCII.GetString(value, 1, 3) == "PNG") return "image/png";
            if (value.Length >= 12 && Encoding.ASCII.GetString(value, 0, 4) == "RIFF" && Encoding.ASCII.GetString(value, 8, 4) == "WEBP") return "image/webp";
            if (value.Length >= 12 && Encoding.ASCII.GetString(value, 4, 8).Contains("ftypavif")) return "image/avif";
            return null;
        }

        public override void Dispose()
        {
            StopHeartbeat();
            client.Dispose();
            syncLock.Dispose();
            base.Dispose();
        }
    }
}
