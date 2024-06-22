const express = require('express');
const bodyParser = require('body-parser');
const { router } = require("./routes/users")
const dotenv = require('dotenv');
const connection = require('./config/db');
const discussionRouter = require('./routes/discussion');

dotenv.config();

const app = express();

app.use(bodyParser.json());

app.use("/users", router)
app.use("/discussion", discussionRouter)

app.get("/", (req, res) => {
  res.send("Server is running!");
});

app.listen(process.env.PORT || 3000, () => {
  console.log(`Server running on port `);
});
