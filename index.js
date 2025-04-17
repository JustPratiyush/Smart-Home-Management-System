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

// Admin middleware
function isAdmin(req, res, next) {
  if (req.session.user && req.session.user.isAdmin) {
    next();
  } else {
    res.status(403).send("Access denied. Admin privileges required.");
  }
}

// Routes
app.get("/login", (req, res) => {
  res.render("login", { error: null });
});

// IMPORTANT: This is the only login POST route (removed the duplicate)
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
    // Check if the password is "1234" since that's your default for all users
    if (user && password === "1234") {
      req.session.user = {
        id: user.UserID,
        name: user.Name,
        email: user.Email,
        isAdmin: user.IsAdmin === 1, // Convert to boolean
      };

      if (user.IsAdmin === 1) {
        res.redirect("/admin/dashboard");
      } else {
        res.redirect("/");
      }
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

// Admin routes
app.get("/admin/dashboard", isAuthenticated, isAdmin, (req, res) => {
  res.render("admin/dashboard", { user: req.session.user });
});

// Add route to view all user credentials (admin only)
app.get("/admin/users", isAuthenticated, isAdmin, async (req, res) => {
  try {
    const connection = await mysql.createConnection({
      host: "localhost",
      user: "root",
      password: "123",
      database: "smart_home_db",
    });

    const [users] = await connection.execute("SELECT * FROM Users");
    await connection.end();

    res.render("admin/users", { users });
  } catch (err) {
    res.status(500).send("Database error");
    console.error(err);
  }
});

// User registration routes
app.get("/register", (req, res) => {
  res.render("register", { error: null });
});

app.post("/register", async (req, res) => {
  const { name, email, password, contact, address } = req.body;

  try {
    const connection = await mysql.createConnection({
      host: "localhost",
      user: "root",
      password: "123",
      database: "smart_home_db",
    });

    // Check if email already exists
    const [existingUsers] = await connection.execute(
      "SELECT * FROM Users WHERE Email = ?",
      [email]
    );

    if (existingUsers.length > 0) {
      await connection.end();
      return res.render("register", { error: "Email already registered" });
    }

    // Insert new user
    await connection.execute(
      "INSERT INTO Users (Name, Email, Password, ContactNumber, Address, IsAdmin) VALUES (?, ?, ?, ?, ?, ?)",
      [name, email, password, contact, address, 0] // 0 = not admin
    );

    await connection.end();
    res.redirect("/login");
  } catch (err) {
    console.error(err);
    res.render("register", { error: "Error creating account" });
  }
});

// Admin route to create a new user
app.get("/admin/users/create", isAuthenticated, isAdmin, (req, res) => {
  res.render("admin/create-user", { error: null });
});

app.post("/admin/users/create", isAuthenticated, isAdmin, async (req, res) => {
  const { name, email, password, contact, address, isAdmin } = req.body;
  const adminFlag = isAdmin ? 1 : 0;

  try {
    const connection = await mysql.createConnection({
      host: "localhost",
      user: "root",
      password: "123",
      database: "smart_home_db",
    });

    // Check if email already exists
    const [existingUsers] = await connection.execute(
      "SELECT * FROM Users WHERE Email = ?",
      [email]
    );

    if (existingUsers.length > 0) {
      await connection.end();
      return res.render("admin/create-user", {
        error: "Email already registered",
      });
    }

    // Insert new user
    await connection.execute(
      "INSERT INTO Users (Name, Email, Password, ContactNumber, Address, IsAdmin) VALUES (?, ?, ?, ?, ?, ?)",
      [name, email, password, contact, address, adminFlag]
    );

    await connection.end();
    res.redirect("/admin/users");
  } catch (err) {
    console.error(err);
    res.render("admin/create-user", { error: "Error creating user" });
  }
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
