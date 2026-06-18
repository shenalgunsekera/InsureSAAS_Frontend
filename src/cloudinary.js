// All uploads now go to Firebase Storage. Re-exported under legacy names
// so existing imports across the codebase require no changes.
export { uploadFile as uploadToCloudinary, viewUrl, openFile } from './storage';
