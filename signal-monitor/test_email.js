require("dotenv").config();
const notifier = require("./notifier");

(async () => {
  const result = await notifier.sendWarningEmail({
    to: "emmanuelatere44@gmail.com",
    label: "Test Agent",
    statusUrl: "https://buildos.tech/status.html?hash=test123",
    daysRemaining: 0,
    hoursRemaining: 2,
  });
  console.log("Send result:", JSON.stringify(result, null, 2));
})();
