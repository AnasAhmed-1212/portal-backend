import express from 'express';
import verifyUser from '../middleWare/authMiddleware.js';
import { getProfile, updateProfile, listUsers, createUser, updateUser, deleteUser, toggleUserStatus, getSellersForAssignment } from '../controller/userController.js';

const router = express.Router();

// all routes require authentication
router.use(verifyUser);

// get current user's profile
router.get('/profile', getProfile);
// update profile
router.put('/profile', updateProfile);

// admin only: list all users
router.get('/all', listUsers);

// admin only: create new user
router.post('/', createUser);

// admin only: update user
router.put('/:id', updateUser);

// admin only: delete user
router.delete('/:id', deleteUser);

// admin only: toggle user status
router.put('/:id/toggle-status', toggleUserStatus);

// admin only: get sellers for assignment
router.get('/sellers-for-assignment', getSellersForAssignment);

export default router;
