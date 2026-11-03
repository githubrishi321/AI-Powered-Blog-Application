const { Router } = require("express");
const router = Router();
const User = require("../../models/user");
const Blog = require("../../models/blog");
const Comment = require("../../models/comment");
const AiLog = require("../../models/aiLog");
const LoginActivity = require("../../models/loginActivity");

router.get("/", async (req, res) => {
  try {
    const now = new Date();
    const startOf7Days = new Date(now - 7 * 24 * 60 * 60 * 1000);
    const startOf30Days = new Date(now - 30 * 24 * 60 * 60 * 1000);
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const [
      totalUsers,
      newUsers7,
      newUsers30,
      totalBlogs,
      totalComments,
      aiToday,
      failedLoginsToday,
      bannedUsers,
      recentUsers,
      recentBlogs,
      recentFailedLogins,
    ] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ createdAt: { $gte: startOf7Days } }),
      User.countDocuments({ createdAt: { $gte: startOf30Days } }),
      Blog.countDocuments(),
      Comment.countDocuments(),
      AiLog.countDocuments({ status: "success", createdAt: { $gte: startOfDay } }),
      LoginActivity.countDocuments({ success: false, createdAt: { $gte: startOfDay } }),
      User.countDocuments({ status: "banned" }),
      User.find().sort({ createdAt: -1 }).limit(5).select("fullName email role status createdAt"),
      Blog.find().sort({ createdAt: -1 }).limit(5).populate("createdBy", "fullName").select("title status createdAt createdBy"),
      LoginActivity.find({ success: false }).sort({ createdAt: -1 }).limit(5),
    ]);

    // 30-day chart data for signups, blogs, AI usage
    const last30Labels = [];
    const signupsData = [];
    const blogsData = [];
    const aiData = [];

    for (let i = 29; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate());
      const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
      last30Labels.push(dayStart.toLocaleDateString("en-US", { month: "short", day: "numeric" }));

      const [su, bl, ai] = await Promise.all([
        User.countDocuments({ createdAt: { $gte: dayStart, $lt: dayEnd } }),
        Blog.countDocuments({ createdAt: { $gte: dayStart, $lt: dayEnd } }),
        AiLog.countDocuments({ status: "success", createdAt: { $gte: dayStart, $lt: dayEnd } }),
      ]);
      signupsData.push(su);
      blogsData.push(bl);
      aiData.push(ai);
    }

    res.render("admin/dashboard", {
      user: req.user,
      stats: { totalUsers, newUsers7, newUsers30, totalBlogs, totalComments, aiToday, failedLoginsToday, bannedUsers },
      recentUsers,
      recentBlogs,
      recentFailedLogins,
      chartLabels: JSON.stringify(last30Labels),
      signupsData: JSON.stringify(signupsData),
      blogsData: JSON.stringify(blogsData),
      aiData: JSON.stringify(aiData),
      flash: req.flash ? req.flash() : {},
    });
  } catch (err) {
    console.error("Admin dashboard error:", err);
    res.status(500).render("error", { user: req.user, message: "Failed to load dashboard." });
  }
});

module.exports = router;

