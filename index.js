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

// Database connection function
async function getConnection() {
  return await mysql.createConnection({
    host: "localhost",
    user: "root",
    password: "123",
    database: "smart_home_db",
  });
}

// Routes
app.get("/login", (req, res) => {
  res.render("login", { error: null });
});

app.post("/login", async (req, res) => {
  const { email, password } = req.body;

  try {
    const connection = await getConnection();
    const [users] = await connection.execute(
      "SELECT * FROM Users WHERE Email = ?",
      [email]
    );
    await connection.end();

    const user = users[0];
    if (user && password === user.Password) {
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

// User registration routes
app.get("/register", (req, res) => {
  res.render("register", { error: null });
});

app.post("/register", async (req, res) => {
  const { name, email, password, contact, address } = req.body;

  try {
    const connection = await getConnection();

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

// Admin user management
app.get("/admin/users", isAuthenticated, isAdmin, async (req, res) => {
  try {
    const connection = await getConnection();
    const [users] = await connection.execute("SELECT * FROM Users");
    await connection.end();

    res.render("admin/users", { users });
  } catch (err) {
    res.status(500).send("Database error");
    console.error(err);
  }
});

// Admin user creation
app.get("/admin/users/create", isAuthenticated, isAdmin, (req, res) => {
  res.render("admin/create-user", { error: null });
});

app.post("/admin/users/create", isAuthenticated, isAdmin, async (req, res) => {
  const { name, email, password, contact, address, isAdmin } = req.body;
  // Fix: Convert isAdmin correctly from form value
  const adminFlag = isAdmin === "1" ? 1 : 0;

  try {
    const connection = await getConnection();

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

// Edit user route - GET
app.get("/admin/users/edit/:id", isAuthenticated, isAdmin, async (req, res) => {
  try {
    const userId = req.params.id;
    const connection = await getConnection();
    const [users] = await connection.execute(
      "SELECT * FROM Users WHERE UserID = ?",
      [userId]
    );
    await connection.end();

    if (users.length === 0) {
      return res.status(404).send("User not found");
    }

    res.render("admin/edit-user", { user: users[0], error: null });
  } catch (err) {
    console.error(err);
    res.status(500).send("Error fetching user data");
  }
});

// Edit user route - POST
app.post(
  "/admin/users/edit/:id",
  isAuthenticated,
  isAdmin,
  async (req, res) => {
    const userId = req.params.id;
    const { name, email, password, contact, address, isAdmin } = req.body;
    // Fix: Convert isAdmin correctly from form value
    const adminFlag = isAdmin === "1" ? 1 : 0;

    try {
      const connection = await getConnection();

      // Check if email is already used by another user
      const [existingUsers] = await connection.execute(
        "SELECT * FROM Users WHERE Email = ? AND UserID != ?",
        [email, userId]
      );

      if (existingUsers.length > 0) {
        // Close the first connection
        await connection.end();

        // Create a new connection to fetch the user details
        const newConnection = await getConnection();
        const [users] = await newConnection.execute(
          "SELECT * FROM Users WHERE UserID = ?",
          [userId]
        );
        await newConnection.end();

        return res.render("admin/edit-user", {
          user: users[0],
          error: "Email already used by another user",
        });
      }

      // Update user
      await connection.execute(
        "UPDATE Users SET Name = ?, Email = ?, Password = ?, ContactNumber = ?, Address = ?, IsAdmin = ? WHERE UserID = ?",
        [name, email, password, contact, address, adminFlag, userId]
      );

      await connection.end();
      res.redirect("/admin/users");
    } catch (err) {
      console.error(err);
      res.status(500).send("Error updating user");
    }
  }
);

// Delete user route
app.get(
  "/admin/users/delete/:id",
  isAuthenticated,
  isAdmin,
  async (req, res) => {
    const userId = req.params.id;

    try {
      const connection = await getConnection();
      await connection.execute("DELETE FROM Users WHERE UserID = ?", [userId]);
      await connection.end();

      res.redirect("/admin/users");
    } catch (err) {
      console.error(err);
      res.status(500).send("Error deleting user");
    }
  }
);

// Other Routes (all protected)
app.get("/users", isAuthenticated, async (req, res) => {
  try {
    const connection = await getConnection();
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
    const connection = await getConnection();
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
    const connection = await getConnection();
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
    const connection = await getConnection();
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
    const connection = await getConnection();
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
