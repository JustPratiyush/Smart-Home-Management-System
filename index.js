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
    res.render("access-denied", { user: req.session.user });
  }
}

// Database connection function
async function getConnection() {
  // Consider using a connection pool (mysql2/promise.createPool) for better performance
  return await mysql.createConnection({
    host: "localhost",
    user: "root",
    password: "123", // Store credentials securely (e.g., environment variables)
    database: "smart_home_db",
  });
}

// Routes
app.get("/login", (req, res) => {
  res.render("login", { error: null });
});

// --- MODIFIED LOGIN ROUTE ---
app.post("/login", async (req, res) => {
  const { email, password } = req.body;

  // It's highly recommended to hash passwords instead of storing/comparing plain text
  try {
    const connection = await getConnection();
    const [users] = await connection.execute(
      "SELECT * FROM Users WHERE Email = ?",
      [email]
    );
    await connection.end(); // Close connection

    const user = users[0];
    // Add password hashing comparison here in a real application (e.g., bcrypt.compare)
    if (user && password === user.Password) {
      req.session.user = {
        id: user.UserID,
        name: user.Name,
        email: user.Email,
        isAdmin: user.IsAdmin === 1, // Convert DB value to boolean
      };

      if (user.IsAdmin === 1) {
        res.redirect("/admin/dashboard");
      } else {
        // --- CHANGE: Redirect non-admin users to /home ---
        res.redirect("/home");
      }
    } else {
      res.render("login", { error: "Invalid credentials" });
    }
  } catch (err) {
    console.error("Login Error:", err); // Log the specific error
    res.render("login", { error: "An error occurred during login." }); // More generic error to user
  }
});

app.get("/logout", (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error("Logout Error:", err);
      // Handle error appropriately, maybe render an error page
      return res.status(500).send("Could not log out.");
    }
    res.redirect("/login");
  });
});

// User registration routes
app.get("/register", (req, res) => {
  res.render("register", { error: null });
});

app.post("/register", async (req, res) => {
  const { name, email, password, contact, address } = req.body;
  // Add input validation here (e.g., check email format, password strength)
  // Add password hashing here (e.g., using bcrypt) before saving

  let connection; // Define connection outside try to use in finally
  try {
    connection = await getConnection();

    // Check if email already exists
    const [existingUsers] = await connection.execute(
      "SELECT UserID FROM Users WHERE Email = ?", // Only select necessary field
      [email]
    );

    if (existingUsers.length > 0) {
      return res.render("register", { error: "Email already registered" });
    }

    // Hash the password before inserting
    // const hashedPassword = await bcrypt.hash(password, 10); // Example

    // Insert new user
    await connection.execute(
      // Use the hashed password variable below instead of 'password'
      "INSERT INTO Users (Name, Email, Password, ContactNumber, Address, IsAdmin) VALUES (?, ?, ?, ?, ?, ?)",
      [name, email, password, contact, address, 0] // 0 = not admin
    );

    res.redirect("/login");
  } catch (err) {
    console.error("Registration Error:", err);
    res.render("register", { error: "Error creating account" });
  } finally {
    if (connection) await connection.end(); // Ensure connection is closed
  }
});

// --- MODIFIED ROOT ROUTE ---
// Redirects authenticated users to the main home page
app.get("/", isAuthenticated, (req, res) => {
  res.redirect("/home");
});

// --- ADDED HOME ROUTE ---
// The main landing page for authenticated non-admin users
app.get("/home", isAuthenticated, (req, res) => {
  // Assuming you have a 'home.ejs' view file in your 'views' directory
  res.render("home", { user: req.session.user });
});

// --- NEW ADMIN CHECK ROUTE ---
app.get("/admin-check", isAuthenticated, isAdmin, (req, res) => {
  res.redirect("/admin/dashboard");
});

// Admin routes
app.get("/admin/dashboard", isAuthenticated, isAdmin, (req, res) => {
  res.render("admin/dashboard", { user: req.session.user });
});

// Admin user management
app.get("/admin/users", isAuthenticated, isAdmin, async (req, res) => {
  let connection;
  try {
    connection = await getConnection();
    const [users] = await connection.execute(
      "SELECT UserID, Name, Email, ContactNumber, Address, IsAdmin FROM Users"
    ); // Avoid selecting password
    res.render("admin/users", { users });
  } catch (err) {
    console.error("Admin Users Fetch Error:", err);
    res.status(500).send("Database error retrieving users");
  } finally {
    if (connection) await connection.end();
  }
});

// Admin user creation
app.get("/admin/users/create", isAuthenticated, isAdmin, (req, res) => {
  res.render("admin/create-user", { error: null });
});

app.post("/admin/users/create", isAuthenticated, isAdmin, async (req, res) => {
  const { name, email, password, contact, address, isAdmin } = req.body;
  const adminFlag = isAdmin === "1" ? 1 : 0;
  // Add input validation
  // Add password hashing

  let connection;
  try {
    connection = await getConnection();

    // Check if email already exists
    const [existingUsers] = await connection.execute(
      "SELECT UserID FROM Users WHERE Email = ?",
      [email]
    );

    if (existingUsers.length > 0) {
      return res.render("admin/create-user", {
        error: "Email already registered",
        // Pass back other form data if needed to repopulate the form
        formData: { name, email, contact, address, isAdmin },
      });
    }

    // Hash the password
    // const hashedPassword = await bcrypt.hash(password, 10); // Example

    await connection.execute(
      // Use hashed password below
      "INSERT INTO Users (Name, Email, Password, ContactNumber, Address, IsAdmin) VALUES (?, ?, ?, ?, ?, ?)",
      [name, email, password, contact, address, adminFlag]
    );

    res.redirect("/admin/users");
  } catch (err) {
    console.error("Admin Create User Error:", err);
    res.render("admin/create-user", {
      error: "Error creating user",
      formData: { name, email, contact, address, isAdmin },
    });
  } finally {
    if (connection) await connection.end();
  }
});

// Edit user route - GET
app.get("/admin/users/edit/:id", isAuthenticated, isAdmin, async (req, res) => {
  let connection;
  try {
    const userId = req.params.id;
    connection = await getConnection();
    // Avoid selecting password if possible, or handle carefully
    const [users] = await connection.execute(
      "SELECT UserID, Name, Email, ContactNumber, Address, IsAdmin FROM Users WHERE UserID = ?",
      [userId]
    );

    if (users.length === 0) {
      return res.status(404).send("User not found");
    }

    res.render("admin/edit-user", { user: users[0], error: null });
  } catch (err) {
    console.error("Admin Edit User GET Error:", err);
    res.status(500).send("Error fetching user data");
  } finally {
    if (connection) await connection.end();
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
    const adminFlag = isAdmin === "1" ? 1 : 0;
    // Add input validation
    // Only update password if a new one is provided, and hash it

    let connection;
    try {
      connection = await getConnection();

      // Check if email is already used by another user
      const [existingUsers] = await connection.execute(
        "SELECT UserID FROM Users WHERE Email = ? AND UserID != ?",
        [email, userId]
      );

      if (existingUsers.length > 0) {
        // Fetch the original user data again to render the form
        const [currentUser] = await connection.execute(
          "SELECT UserID, Name, Email, ContactNumber, Address, IsAdmin FROM Users WHERE UserID = ?",
          [userId]
        );
        if (currentUser.length === 0)
          return res.status(404).send("User not found"); // Should not happen ideally

        return res.render("admin/edit-user", {
          user: currentUser[0], // Pass original user data back
          error: "Email already used by another user",
        });
      }

      // Construct update query - handle password separately
      let sql =
        "UPDATE Users SET Name = ?, Email = ?, ContactNumber = ?, Address = ?, IsAdmin = ?";
      let params = [name, email, contact, address, adminFlag];

      if (password) {
        // Only update password if provided
        // Hash the new password
        // const hashedPassword = await bcrypt.hash(password, 10); // Example
        sql += ", Password = ?";
        params.push(password); // Use hashedPassword here
      }

      sql += " WHERE UserID = ?";
      params.push(userId);

      await connection.execute(sql, params);

      res.redirect("/admin/users");
    } catch (err) {
      console.error("Admin Edit User POST Error:", err);
      // Fetch user data again to render form with error
      let userToRender = { UserID: userId, ...req.body }; // Use submitted data for form repopulation
      try {
        const tempConn = await getConnection();
        const [users] = await tempConn.execute(
          "SELECT UserID, Name, Email, ContactNumber, Address, IsAdmin FROM Users WHERE UserID = ?",
          [userId]
        );
        await tempConn.end();
        if (users.length > 0) userToRender = users[0]; // Prefer DB data if fetchable
      } catch (fetchErr) {
        console.error(
          "Error fetching user data after update failure:",
          fetchErr
        );
      }
      res.render("admin/edit-user", {
        user: userToRender,
        error: "Error updating user.",
      });
    } finally {
      if (connection) await connection.end();
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
    // Consider adding a confirmation step before deleting
    let connection;
    try {
      connection = await getConnection();
      // You might want to consider related data deletion or setting user inactive instead of hard delete
      await connection.execute("DELETE FROM Users WHERE UserID = ?", [userId]);
      res.redirect("/admin/users");
    } catch (err) {
      console.error("Admin Delete User Error:", err);
      res.status(500).send("Error deleting user");
    } finally {
      if (connection) await connection.end();
    }
  }
);

// Other Protected Routes (for authenticated users)

app.get("/users", isAuthenticated, async (req, res) => {
  let connection;
  try {
    connection = await getConnection();
    // Avoid selecting passwords
    const [users] = await connection.execute(
      "SELECT UserID, Name, Email, ContactNumber, Address, IsAdmin FROM Users"
    );
    res.render("users", { users }); // Assumes 'users.ejs' exists
  } catch (err) {
    console.error("Fetch Users Error:", err);
    res.status(500).send("Database error loading users");
  } finally {
    if (connection) await connection.end();
  }
});

app.get("/devices", isAuthenticated, async (req, res) => {
  let connection;
  try {
    connection = await getConnection();
    const [devices] = await connection.execute(
      `
      SELECT d.DeviceID, d.Name, d.Type, d.Status, d.PowerConsumption, u.Name AS UserName
      FROM Devices d
      LEFT JOIN Users u ON d.UserID = u.UserID
      WHERE d.UserID = ? OR ? = 1`, // Show only user's devices unless admin
      [req.session.user.id, req.session.user.isAdmin ? 1 : 0]
    );
    res.render("devices", { devices }); // Assumes 'devices.ejs' exists
  } catch (err) {
    console.error("Fetch Devices Error:", err);
    res.status(500).send("Error loading devices");
  } finally {
    if (connection) await connection.end();
  }
});

app.get("/rooms", isAuthenticated, async (req, res) => {
  let connection;
  try {
    connection = await getConnection();
    const [rooms] = await connection.execute(
      `
        SELECT r.RoomID, r.Name AS RoomName, u.Name AS UserName
        FROM Rooms r
        LEFT JOIN Users u ON r.UserID = u.UserID
        WHERE r.UserID = ? OR ? = 1`, // Show only user's rooms unless admin
      [req.session.user.id, req.session.user.isAdmin ? 1 : 0]
    );
    res.render("rooms", { rooms }); // Assumes 'rooms.ejs' exists
  } catch (err) {
    console.error("Fetch Rooms Error:", err);
    res.status(500).send("Error loading rooms");
  } finally {
    if (connection) await connection.end();
  }
});

app.get("/sensors", isAuthenticated, async (req, res) => {
  let connection;
  try {
    connection = await getConnection();
    // Modify query if sensors are linked to users or only show sensors in user's rooms
    const [sensors] = await connection.execute(`
      SELECT s.SensorID, s.Type, s.Status, r.Name AS RoomName
      FROM Sensors s
      LEFT JOIN Rooms r ON s.RoomID = r.RoomID
      -- Potentially add WHERE clause based on user's rooms or admin status
    `);
    res.render("sensors", { sensors }); // Assumes 'sensors.ejs' exists
  } catch (err) {
    console.error("Fetch Sensors Error:", err);
    res.status(500).send("Error loading sensors");
  } finally {
    if (connection) await connection.end();
  }
});

app.get("/automation", isAuthenticated, async (req, res) => {
  let connection;
  try {
    connection = await getConnection();
    // Modify query if automation rules are linked to users or devices owned by user
    const [rules] = await connection.execute(`
      SELECT a.RuleID, a.Description, a.ScheduleTime, a.Action, d.Name AS DeviceName
      FROM AutomationRules a
      LEFT JOIN Devices d ON a.DeviceID = d.DeviceID
      -- Potentially add WHERE clause based on user's devices or admin status
    `);
    res.render("automation", { rules }); // Assumes 'automation.ejs' exists
  } catch (err) {
    console.error("Fetch Automation Rules Error:", err);
    res.status(500).send("Error loading automation rules");
  } finally {
    if (connection) await connection.end();
  }
});

// Catch-all for 404 Not Found errors
app.use((req, res, next) => {
  res.status(404).render("404"); // Assuming you have a '404.ejs' view
});

// Basic Error Handling Middleware (optional, can be more sophisticated)
app.use((err, req, res, next) => {
  console.error("Unhandled Error:", err);
  res.status(500).send("Something broke!");
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
