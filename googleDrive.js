const fs = require("fs");
const { google } = require("googleapis");
const path = require("path");
const { queryAsync } = require("./routes/users");

const CREDENTIALS_PATH = path.join(__dirname, "drive_creds.json");
const SCOPES = ["https://www.googleapis.com/auth/drive.file"];

const auth = new google.auth.GoogleAuth({
	keyFile: CREDENTIALS_PATH,
	scopes: SCOPES,
});

const drive = google.drive({ version: "v3", auth });

async function uploadFileToDrive(filePath, mimeType) {
	const fileMetadata = {
		name: path.basename(filePath),
	};
	const media = {
		mimeType: mimeType,
		body: fs.createReadStream(filePath),
	};

	const response = await drive.files.create({
		resource: fileMetadata,
		media: media,
		fields: "id, webViewLink, webContentLink",
	});

	await setFilePublic(response.data.id);
	return await insertImageData(
		response.data.id,
		response.data.webViewLink,
		response.data.webContentLink
	);
}

async function setFilePublic(fileId) {
	await drive.permissions.create({
		fileId: fileId,
		requestBody: {
			role: "reader",
			type: "anyone",
		},
	});
}

async function deleteFileFromDrive(fileId, imageId) {
	try {
		await drive.files.delete({
			fileId: fileId,
		});
		console.log(
			`File with ID ${fileId} deleted successfully from Google Drive.`
		);
		await deleteImageData(imageId);
	} catch (err) {
		throw new Error(
			`Failed to delete file from Google Drive: ${err.message}`
		);
	}
}

async function deleteImageData(imageId) {
	try {
		const results = await queryAsync(
			"DELETE FROM google_drive_images WHERE id = ?",
			[imageId]
		);

		if (results.affectedRows === 0) {
			throw new Error(
				"Image data with specified ID not found or already deleted"
			);
		}

		return true;
	} catch (error) {
		throw new Error(`Error deleting image data: ${error.message}`);
	}
}

async function insertImageData(image_id, webViewLink, webContentLink) {
	const created = Math.floor(Date.now() / 1000);
	const updated = created;

	const insertQuery = `
        INSERT INTO google_drive_images (image_id, web_view_link, web_content_link, created, updated)
        VALUES (?, ?, ?, ?, ?)
    `;

	try {
		const results = await queryAsync(insertQuery, [
			image_id,
			webViewLink,
			webContentLink,
			created,
			updated,
		]);

		if (results && results.insertId) {
			return results.insertId;
		} else {
			throw new Error("Failed to insert image data into database");
		}
	} catch (error) {
		throw new Error(`Error inserting image data: ${error.message}`);
	}
}

module.exports = { uploadFileToDrive, deleteFileFromDrive };
