using Playnite.SDK.Data;
using System.Collections.Generic;

namespace GamingStatsSync
{
    public sealed class SourceDto
    {
        public string id { get; set; }
        public string name { get; set; }
    }

    public sealed class ReleaseDateDto
    {
        public int year { get; set; }
        public int? month { get; set; }
        public int? day { get; set; }
    }

    public sealed class ScoresDto
    {
        public int? user { get; set; }
        public int? critic { get; set; }
        public int? community { get; set; }
    }

    public sealed class LinkDto
    {
        public string name { get; set; }
        public string url { get; set; }
    }

    public sealed class ArtworkItemDto
    {
        public string assetId { get; set; }
        public string contentType { get; set; }
        public int? width { get; set; }
        public int? height { get; set; }
    }

    public sealed class ArtworkDto
    {
        public ArtworkItemDto icon { get; set; }
        public ArtworkItemDto cover { get; set; }
        public ArtworkItemDto background { get; set; }
    }

    public sealed class GameDto
    {
        public string playniteId { get; set; }
        public string providerGameId { get; set; }
        public string libraryPluginId { get; set; }
        public SourceDto source { get; set; }
        public string name { get; set; }
        public string sortingName { get; set; }
        public long playtimeSeconds { get; set; }
        public long playCount { get; set; }
        public string lastActivityAt { get; set; }
        public string addedAt { get; set; }
        public string modifiedAt { get; set; }
        public bool isInstalled { get; set; }
        public bool isRunning { get; set; }
        public bool hidden { get; set; }
        public bool favorite { get; set; }
        public bool isCustomGame { get; set; }
        public long? installSizeBytes { get; set; }
        public ReleaseDateDto releaseDate { get; set; }
        public string completionStatus { get; set; }
        public List<string> platforms { get; set; }
        public List<string> genres { get; set; }
        public List<string> categories { get; set; }
        public List<string> tags { get; set; }
        public List<string> features { get; set; }
        public List<string> ageRatings { get; set; }
        public List<string> regions { get; set; }
        public List<string> series { get; set; }
        public List<string> developers { get; set; }
        public List<string> publishers { get; set; }
        public ScoresDto scores { get; set; }
        public List<LinkDto> links { get; set; }
        public ArtworkDto artwork { get; set; }

        [DontSerialize]
        public string iconPath { get; set; }
        [DontSerialize]
        public string coverPath { get; set; }
        [DontSerialize]
        public string backgroundPath { get; set; }
    }

    public sealed class LibraryDto
    {
        public int schemaVersion { get; set; } = 1;
        public string deviceId { get; set; }
        public string deviceName { get; set; }
        public long sequence { get; set; }
        public string generatedAt { get; set; }
        public string playniteVersion { get; set; }
        public string extensionVersion { get; set; }
        public List<GameDto> games { get; set; }
    }

    public sealed class CurrentGameDto
    {
        public string playniteId { get; set; }
        public string providerGameId { get; set; }
        public SourceDto source { get; set; }
        public string name { get; set; }
        public string startedAt { get; set; }
    }

    public sealed class PresenceDto
    {
        public int schemaVersion { get; set; } = 1;
        public string deviceId { get; set; }
        public string deviceName { get; set; }
        public long sequence { get; set; }
        public string generatedAt { get; set; }
        public string playniteVersion { get; set; }
        public string extensionVersion { get; set; }
        public string state { get; set; }
        public CurrentGameDto currentGame { get; set; }
    }
}
