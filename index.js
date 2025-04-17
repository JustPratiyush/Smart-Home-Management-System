const express = require("express");
const mysql = require("mysql2/promise");
const session = require("express-session");
const bodyParser = require("body-parser");
const path = require("path");

const app = express();
const PORT = 3000;

// Middleware
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static("public"));

app.use(
  session({
    secret: "smart_home_secret",
    resave: false,
    saveUninitialized: false,
  })
);

// Simple auth middleware
function isAuthenticated(req, res, next) {
  if (req.session.user) {
    next();
  } else {
    res.redirect("/login");
  }
}

// Routes
app.get("/login", (req, res) => {
  res.render("login", { error: null });
});

app.post("/login", async (req, res) => {
  const { email, password } = req.body;

  try {
    const connection = await mysql.createConnection({
      host: "localhost",
      user: "root",
      password: "123",
      database: "smart_home_db",
    });

    const [users] = await connection.execute(
      "SELECT * FROM Users WHERE Email = ?",
      [email]
    );
    await connection.end();

    const user = users[0];
    if (user && password === "1234") {
      // Replace with real password check
      req.session.user = {
        id: user.UserID,
        name: user.Name,
        email: user.Email,
      };
      res.redirect("/");
    } else {
      res.render("login", { error: "Invalid credentials" });
    }
  } catch (err) {
    console.error(err);
    res.render("login", { error: "Database error" });
  }
});

app.get("/logout", (req, res) => {
  req.session.destroy(() => {
    res.redirect("/login");
  });
});

// Home Route (protected)
app.get("/", isAuthenticated, (req, res) => {
  res.send(`
    <h2>Welcome ${req.session.user.name} to the Smart Home Management System</h2>
    <ul>
      <li><a href="/users">View Users</a></li>
      <li><a href="/devices">View Devices</a></li>
      <li><a href="/rooms">View Rooms</a></li>
      <li><a href="/sensors">View Sensors</a></li>
      <li><a href="/automation">View Automation Rules</a></li>
      <li><a href="/logout">Logout</a></li>
    </ul>
  `);
});

// Other Routes (all protected)
app.get("/users", isAuthenticated, async (req, res) => {
  try {
    const connection = await mysql.createConnection({
      host: "localhost",
      user: "root",
      password: "123",
      database: "smart_home_db",
    });

    const [users] = await connection.execute("SELECT * FROM Users");
    await connection.end();

    res.render("users", { users });
  } catch (err) {
    res.status(500).send("Database error");
    console.error(err);
  }
});

app.get("/devices", isAuthenticated, async (req, res) => {
  try {
    const connection = await mysql.createConnection({
      host: "localhost",
      user: "root",
      password: "123",
      database: "smart_home_db",
    });

    const [devices] = await connection.execute(`
      SELECT d.DeviceID, d.Name, d.Type, d.Status, d.PowerConsumption, u.Name AS UserName
      FROM Devices d
      LEFT JOIN Users u ON d.UserID = u.UserID
    `);

    await connection.end();
    res.render("devices", { devices });
  } catch (err) {
    console.error(err);
    res.status(500).send("Error loading devices");
  }
});

app.get("/rooms", isAuthenticated, async (req, res) => {
  try {
    const connection = await mysql.createConnection({
      host: "localhost",
      user: "root",
      password: "123",
      database: "smart_home_db",
    });

    const [rooms] = await connection.execute(`
      SELECT r.RoomID, r.Name AS RoomName, u.Name AS UserName
      FROM Rooms r
      LEFT JOIN Users u ON r.UserID = u.UserID
    `);

    await connection.end();
    res.render("rooms", { rooms });
  } catch (err) {
    console.error(err);
    res.status(500).send("Error loading rooms");
  }
});

app.get("/sensors", isAuthenticated, async (req, res) => {
  try {
    const connection = await mysql.createConnection({
      host: "localhost",
      user: "root",
      password: "123",
      database: "smart_home_db",
    });

    const [sensors] = await connection.execute(`
      SELECT s.SensorID, s.Type, s.Status, r.Name AS RoomName
      FROM Sensors s
      LEFT JOIN Rooms r ON s.RoomID = r.RoomID
    `);

    await connection.end();
    res.render("sensors", { sensors });
  } catch (err) {
    console.error(err);
    res.status(500).send("Error loading sensors");
  }
});

app.get("/automation", isAuthenticated, async (req, res) => {
  try {
    const connection = await mysql.createConnection({
      host: "localhost",
      user: "root",
      password: "123",
      database: "smart_home_db",
    });

    const [rules] = await connection.execute(`
      SELECT a.RuleID, a.Description, a.ScheduleTime, a.Action, d.Name AS DeviceName
      FROM AutomationRules a
      LEFT JOIN Devices d ON a.DeviceID = d.DeviceID
    `);

    await connection.end();
    res.render("automation", { rules });
  } catch (err) {
    console.error(err);
    res.status(500).send("Error loading automation rules");
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
