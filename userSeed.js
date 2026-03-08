import User from './models/user.js';
import bcrypt from "bcrypt";
import connectToDb from "./db.js";

const userRegister = async () => {
  connectToDb();

  try {
    const hashPassword = await bcrypt.hash("admin", 10);

    const newUser = new User({
      name: "admin",
      email: "admin@gmail.com",
      password: hashPassword ,
      role: admin,
    });

      await newUser.save();
      console.log("Admin user created!");
      } catch (error) {
      console.log(error);
      }
};

export default userRegister;
