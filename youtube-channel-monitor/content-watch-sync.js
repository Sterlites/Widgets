/**
 * YouTube Channel Monitor — Watch Sync Content Script
 * Bi-directionally syncs watch status: detects when a video is watched
 * on YouTube (>80% progress or completed) and automatically marks it as watched.
 */

(() => {
  const reportedVideos = new Set();
  let currentVideoId = null;
  let attachedVideo = null;
  let checkIntervalId = null;

  function getVideoId() {
    try {
      const url = new URL(window.location.href);
      if (url.pathname === '/watch') {
        return url.searchParams.get('v');
      }
      if (url.pathname.startsWith('/shorts/')) {
        return url.pathname.split('/shorts/')[1]?.split('?')[0];
      }
    } catch {}
    return null;
  }

  function reportWatched(videoId) {
    if (!videoId || reportedVideos.has(videoId)) return;
    reportedVideos.add(videoId);

    try {
      chrome.runtime.sendMessage({
        action: 'markVideoWatched',
        videoId,
        source: 'youtube-web'
      }, () => {
        if (chrome.runtime.lastError) {
          // Extension might have reloaded; ignore gracefully
        }
      });
    } catch {}
  }

  function checkProgress() {
    const video = attachedVideo || document.querySelector('video.html5-main-video') || document.querySelector('video');
    if (!video || !currentVideoId) return;

    if (reportedVideos.has(currentVideoId)) return;

    const duration = video.duration;
    const currentTime = video.currentTime;

    if (duration > 0 && currentTime > 0) {
      // If watched past 80% or less than 30s remaining
      const ratio = currentTime / duration;
      const remaining = duration - currentTime;

      if (ratio >= 0.8 || (duration > 60 && remaining <= 20)) {
        reportWatched(currentVideoId);
      }
    }
  }

  function attachListeners() {
    const videoId = getVideoId();
    if (!videoId) {
      currentVideoId = null;
      return;
    }

    currentVideoId = videoId;
    const video = document.querySelector('video.html5-main-video') || document.querySelector('video');
    if (!video) return;

    if (attachedVideo !== video) {
      attachedVideo = video;
      video.addEventListener('ended', () => {
        if (currentVideoId) reportWatched(currentVideoId);
      });
      video.addEventListener('timeupdate', checkProgress);
    }
  }

  // Handle YouTube SPA Navigation
  window.addEventListener('yt-navigate-finish', () => {
    setTimeout(attachListeners, 800);
  });
  window.addEventListener('popstate', () => {
    setTimeout(attachListeners, 800);
  });

  // Polling fallback to guarantee video element detection
  checkIntervalId = setInterval(() => {
    const newId = getVideoId();
    if (newId !== currentVideoId) {
      attachListeners();
    } else {
      checkProgress();
    }
  }, 3000);

  // Initial setup
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', attachListeners);
  } else {
    attachListeners();
  }
})();
