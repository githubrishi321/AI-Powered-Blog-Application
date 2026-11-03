const cloudinary = require("cloudinary").v2;
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const multer = require("multer");

const PLACEHOLDER_URL = "/Images/blog-placeholder.svg";
const ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB

// Configure Cloudinary if environment variables are set
const isCloudinaryConfigured = Boolean(
  process.env.CLOUDINARY_CLOUD_NAME &&
  process.env.CLOUDINARY_API_KEY &&
  process.env.CLOUDINARY_API_SECRET
);

if (isCloudinaryConfigured) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
    secure: true,
  });
}

const publicDirectory = path.resolve(__dirname, "..", "public");
const uploadsDirectory = path.join(publicDirectory, "uploads");
if (!fs.existsSync(uploadsDirectory)) {
  fs.mkdirSync(uploadsDirectory, { recursive: true });
}

/**
 * Maps mimetype to a safe file extension
 */
function getExtensionFromMime(mimetype) {
  switch (mimetype) {
    case "image/jpeg":
      return "jpg";
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    case "image/gif":
      return "gif";
    default:
      return "bin";
  }
}

/**
 * Upload an image buffer to storage (Cloudinary or local fallback)
 * @param {Buffer} buffer - File buffer from multer memoryStorage
 * @param {string} mimetype - Validated MIME type
 * @param {object} [options] - Additional upload options
 * @returns {Promise<{ url: string, publicId: string }>}
 */
async function upload(buffer, mimetype, options = {}) {
  if (!buffer || !Buffer.isBuffer(buffer)) {
    throw new Error("Invalid file buffer provided for upload.");
  }

  if (!ALLOWED_MIME_TYPES.includes(mimetype)) {
    throw new Error(`Unsupported image type "${mimetype}". Allowed types: JPEG, PNG, WebP, GIF.`);
  }

  // 1. Cloudinary upload (Primary)
  if (isCloudinaryConfigured) {
    return new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder: options.folder || "blogify_covers",
          resource_type: "image",
          allowed_formats: ["jpg", "png", "webp", "gif"],
          transformation: options.transformation || [{ quality: "auto", fetch_format: "auto" }],
        },
        (error, result) => {
          if (error) {
            console.error("Cloudinary upload failed:", error);
            return reject(new Error("Failed to upload image to cloud storage: " + error.message));
          }
          resolve({
            url: result.secure_url,
            publicId: result.public_id,
          });
        }
      );
      uploadStream.end(buffer);
    });
  }

  // 2. Production check: never write to ephemeral disk in production without Cloudinary
  if (process.env.NODE_ENV === "production") {
    const errMsg = "Cloudinary is not configured in production. Upload rejected to prevent data loss on ephemeral storage.";
    console.error(`[STORAGE ERROR] ${errMsg}`);
    throw new Error("Image upload is currently unavailable. Please contact the administrator to configure cloud storage.");
  }

  // 3. Local fallback (Development only)
  console.warn(
    "[WARNING] CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, or CLOUDINARY_API_SECRET missing. Falling back to local disk storage (public/uploads). Note: Render ephemeral disk will lose these files."
  );

  const ext = getExtensionFromMime(mimetype);
  const safeFilename = `${Date.now()}-${crypto.randomBytes(8).toString("hex")}.${ext}`;
  const targetPath = path.join(uploadsDirectory, safeFilename);

  await fs.promises.writeFile(targetPath, buffer);

  return {
    url: `/uploads/${safeFilename}`,
    publicId: safeFilename,
  };
}

/**
 * Remove an asset from storage (Cloudinary or local disk)
 * @param {string} publicId - Cloudinary public_id or local filename
 * @returns {Promise<boolean>}
 */
async function remove(publicId) {
  if (!publicId) return false;

  // Cloudinary removal
  if (isCloudinaryConfigured && (publicId.includes("/") || !publicId.includes("."))) {
    try {
      const result = await cloudinary.uploader.destroy(publicId);
      return result.result === "ok";
    } catch (err) {
      console.error(`Failed to remove Cloudinary asset ${publicId}:`, err.message);
      return false;
    }
  }

  // Local fallback removal
  try {
    const filename = path.basename(publicId);
    const localPath = path.join(uploadsDirectory, filename);
    if (fs.existsSync(localPath)) {
      await fs.promises.unlink(localPath);
      return true;
    }
  } catch (err) {
    console.error(`Failed to delete local asset ${publicId}:`, err.message);
  }

  return false;
}

/**
 * Server-side guard to resolve cover image URL.
 * Checks file existence for local paths, returns placeholder if missing or invalid.
 *
 * @param {object|string} blog - Blog document or cover URL string
 * @returns {string} Safe image URL (remote HTTPS URL, existing local path, or placeholder)
 */
function resolveCoverUrl(blog) {
  const rawUrl = typeof blog === "string" ? blog : blog?.coverImageURL;

  if (!rawUrl || typeof rawUrl !== "string" || !rawUrl.trim()) {
    return PLACEHOLDER_URL;
  }

  const cleanUrl = rawUrl.trim();

  // 1. Remote URL (Cloudinary or HTTPS)
  if (cleanUrl.startsWith("http://") || cleanUrl.startsWith("https://")) {
    return cleanUrl;
  }

  // 2. Local uploaded file: normalize path and verify physical file exists
  let localRelative = cleanUrl;
  if (localRelative.startsWith("/")) {
    localRelative = localRelative.slice(1);
  }

  // Ensure path starts with uploads/
  if (localRelative.startsWith("public/")) {
    localRelative = localRelative.replace(/^public\//, "");
  }

  const absoluteDiskPath = path.join(publicDirectory, localRelative);

  try {
    if (fs.existsSync(absoluteDiskPath)) {
      return `/${localRelative.replace(/\\/g, "/")}`;
    }
  } catch (err) {
    // Disk read check error
  }

  // 3. File is missing from disk!
  const blogTitle = typeof blog === "object" && blog ? (blog.title || blog._id || "Untitled") : "Unknown";
  console.warn(
    `[COVER GUARD] Missing cover file for blog "${blogTitle}": ${cleanUrl} -> Falling back to placeholder ${PLACEHOLDER_URL}`
  );

  return PLACEHOLDER_URL;
}

/**
 * Memory storage Multer instance with MIME and file size guards
 */
const uploadCover = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_FILE_SIZE,
  },
  fileFilter: (req, file, cb) => {
    if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Only image files (JPEG, PNG, WebP, GIF) are allowed!"), false);
    }
  },
});

module.exports = {
  upload,
  remove,
  resolveCoverUrl,
  uploadCover,
  PLACEHOLDER_URL,
  ALLOWED_MIME_TYPES,
  MAX_FILE_SIZE,
  isCloudinaryConfigured: () => isCloudinaryConfigured,
};
