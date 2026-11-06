/**
 * Shared Anonymity Helper (Hardened)
 *
 * Resolves the displayed author name, avatar, and link for public display.
 * FAILS CLOSED:
 * - Accepts ONLY a Blog document (Mongoose or lean).
 * - Treats document as an experience if type === "experience" OR an experience object is present.
 * - For an experience, returns real author ONLY when experience.anonymous === false explicitly.
 * - If experience.anonymous is missing, null, or undefined, defaults to "Anonymous Student".
 * - In development, warns if type is undefined.
 * - Always returns strictly: { name, avatar, link: null }
 *
 * @param {object} blog - The blog or experience document
 * @returns {{ name: string, avatar: string, link: null }}
 */
function getPublicAuthor(blog) {
  const DEFAULT_AVATAR = "/Images/default.svg";

  if (!blog || typeof blog !== "object") {
    return {
      name: "Deleted user",
      avatar: DEFAULT_AVATAR,
      link: null,
    };
  }

  // Warn in development if blog.type is undefined
  if (process.env.NODE_ENV !== "production" && blog.type === undefined) {
    console.warn("[WARN getPublicAuthor] Blog document missing 'type' property. Failing closed.");
  }

  // Treat as experience if type === "experience" OR experience subdocument is present
  const isExperience = blog.type === "experience" || Boolean(blog.experience);

  if (isExperience) {
    // Fail closed: real author ONLY when anonymous is explicitly false
    if (blog.experience?.anonymous !== false) {
      return {
        name: "Anonymous Student",
        avatar: DEFAULT_AVATAR,
        link: null,
      };
    }
  }

  // Resolve author from createdBy
  const user = blog.createdBy;

  // Handle createdBy being null, undefined, or unpopulated ObjectId (no fullName)
  if (!user || typeof user !== "object" || !user.fullName) {
    return {
      name: "Deleted user",
      avatar: DEFAULT_AVATAR,
      link: null,
    };
  }

  return {
    name: String(user.fullName),
    avatar: user.profileImageURL ? String(user.profileImageURL) : DEFAULT_AVATAR,
    link: null,
  };
}

module.exports = {
  getPublicAuthor,
};
