const express = require("express");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3000;

console.log("SERVER STARTAR...");

app.get("/ping", (req, res) => {
  res.json({ status: "API is running", time: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`🚀 Server is running on port ${PORT}`);
});
