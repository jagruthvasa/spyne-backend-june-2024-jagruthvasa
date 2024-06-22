const mysql = require("mysql2");
const dotenv = require("dotenv");

dotenv.config();

const connectionConfig = {
	host: process.env.DB_HOST,
	user: process.env.DB_USER,
	password: process.env.DB_PASSWORD,
	database: process.env.DB_NAME,
	connectTimeout: 10000, // 10 seconds timeout for initial connection
};

const handleDisconnect = () => {
	connection = mysql.createConnection(connectionConfig);

	connection.connect((err) => {
		if (err) {
			console.error("Error connecting to MySQL:", err);
			setTimeout(handleDisconnect, 2000); // Reconnect after 2 seconds
		} else {
			console.log("Connected to MySQL");
			createTables(); // Call createTables function only after successful connection
		}
	});

	connection.on("error", (err) => {
		console.error("MySQL connection error:", err);
		if (
			err.code === "PROTOCOL_CONNECTION_LOST" ||
			err.code === "ECONNRESET"
		) {
			handleDisconnect();
		} else {
			throw err;
		}
	});
};

const createTables = () => {
	const userTableQuery = `
    CREATE TABLE IF NOT EXISTS users (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      mobile_number BIGINT(10) NOT NULL,
      email VARCHAR(255) NOT NULL,
      active TINYINT(1) NOT NULL DEFAULT 1,
      created INT(11) NOT NULL,
      updated INT(11) NOT NULL
    )
  `;

	const blogTableQuery = `
    CREATE TABLE IF NOT EXISTS blog (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT(11) NOT NULL,
      text_field TEXT NOT NULL,
      image INT(11) DEFAULT NULL,
      likes INT(11) DEFAULT 0,
      active TINYINT(1) NOT NULL DEFAULT 1,
      created INT(11) NOT NULL,
      updated INT(11) NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `;

	const postLikesTableQuery = `
    CREATE TABLE IF NOT EXISTS post_likes (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT(11) NOT NULL,
      blog_id INT(11) NOT NULL,
      active TINYINT(1) NOT NULL DEFAULT 1,
      created INT(11) NOT NULL,
      updated INT(11) NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (blog_id) REFERENCES blog(id)
    )
  `;

	const commentTableQuery = `
    CREATE TABLE IF NOT EXISTS comment (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT(11) NOT NULL,
      blog_id INT(11) NOT NULL,
      comment_text TEXT,
      comment_id INT(11),
      likes INT(11) DEFAULT 0,
      active TINYINT(1) NOT NULL DEFAULT 1,
      created INT(11) NOT NULL,
      updated INT(11) NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (blog_id) REFERENCES blog(id)
    )
  `;

	const commentLikesTableQuery = `
    CREATE TABLE IF NOT EXISTS comment_likes (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT(11) NOT NULL,
      comment_id INT(11) NOT NULL,
      active TINYINT(1) NOT NULL DEFAULT 1,
      created INT(11) NOT NULL,
      updated INT(11) NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (comment_id) REFERENCES comment(id)
    )
  `;

	const TagTableQuery = `
      CREATE TABLE IF NOT EXISTS tag (
        id INT AUTO_INCREMENT PRIMARY KEY,
        tag VARCHAR(255) NOT NULL,
        blog_id INT(11) NOT NULL,
        active TINYINT(1) NOT NULL DEFAULT 1,
        created INT(11) NOT NULL,
        updated INT(11) NOT NULL,
        FOREIGN KEY (blog_id) REFERENCES blog(id)
      )
    `;

	const GoogleDriveImages = `CREATE TABLE IF NOT EXISTS google_drive_images (
        id INT AUTO_INCREMENT PRIMARY KEY,
        image_id VARCHAR(255) NOT NULL,
        web_view_link VARCHAR(255) NOT NULL,
        web_content_link VARCHAR(255) NOT NULL,
        created INT(11) NOT NULL,
        updated INT(11) NOT NULL
      )
    `;

	connection.query(userTableQuery, (err, results) => {
		if (err) {
			console.error("Error creating users table:", err);
		} else {
			console.log("Users table created or already exists");
		}
	});

	connection.query(blogTableQuery, (err, results) => {
		if (err) {
			console.error("Error creating blog table:", err);
		} else {
			console.log("Blog table created or already exists");
		}
	});

	connection.query(postLikesTableQuery, (err, results) => {
		if (err) {
			console.error("Error creating post_likes table:", err);
		} else {
			console.log("Post_likes table created or already exists");
		}
	});

	connection.query(commentTableQuery, (err, results) => {
		if (err) {
			console.error("Error creating comment table:", err);
		} else {
			console.log("Comment table created or already exists");
		}
	});

	connection.query(commentLikesTableQuery, (err, results) => {
		if (err) {
			console.error("Error creating tag table:", err);
		} else {
			console.log("tag table created or already exists");
		}
	});

	connection.query(TagTableQuery, (err, results) => {
		if (err) {
			console.error("Error creating comment_likes table:", err);
		} else {
			console.log("Comment_likes table created or already exists");
		}
	});

	connection.query(GoogleDriveImages, (err, results) => {
		if (err) {
			console.error(
				"Error creating google drive images table:",
				err
			);
		} else {
			console.log(
				"google drive images table created or already exists"
			);
		}
	});
};

handleDisconnect();

module.exports = connection;
