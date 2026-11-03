/**
 * Blogify - Client-Side Image Fallback Handler
 * Prevents broken image icons and layout shift by gracefully substituting
 * the standard SVG placeholder or default avatar whenever an image fails to load.
 * Complies with strict Helmet CSP (zero inline event handlers).
 */
(function () {
  const BLOG_PLACEHOLDER_SRC = "/Images/blog-placeholder.svg";
  const AVATAR_PLACEHOLDER_SRC = "/Images/default.svg";

  function handleImageError(event) {
    const img = event.target;
    if (img && img.tagName === "IMG") {
      if (img.dataset.fallbackApplied === "true") {
        return;
      }
      img.dataset.fallbackApplied = "true";

      const isAvatar =
        img.classList.contains("rounded-circle") ||
        img.classList.contains("author-card-avatar") ||
        img.classList.contains("author-avatar") ||
        img.classList.contains("comment-avatar");

      img.src = isAvatar ? AVATAR_PLACEHOLDER_SRC : BLOG_PLACEHOLDER_SRC;
      img.classList.add("placeholder-fallback");
    }
  }

  function attachFallbackListeners() {
    const images = document.querySelectorAll(
      "img.blog-cover, img.card-img-top, img.author-card-avatar, img.author-avatar, img.comment-avatar, img.rounded-circle, .blog-cover-container img"
    );
    images.forEach(function (img) {
      if (img.dataset.listenerAttached !== "true") {
        img.dataset.listenerAttached = "true";
        if (img.complete && img.naturalWidth === 0) {
          handleImageError({ target: img });
        } else {
          img.addEventListener("error", handleImageError);
        }
      }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", attachFallbackListeners);
  } else {
    attachFallbackListeners();
  }

  if (typeof MutationObserver !== "undefined") {
    const observer = new MutationObserver(function () {
      attachFallbackListeners();
    });
    observer.observe(document.body || document.documentElement, {
      childList: true,
      subtree: true,
    });
  }
})();
