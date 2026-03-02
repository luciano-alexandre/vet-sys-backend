import { Router } from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import { login, me } from "../controllers/auth.controller.js";
import { requireAuth } from "../middlewares/auth.js";

const router = Router();

router.post("/login", asyncHandler(login));
router.get("/me", requireAuth, asyncHandler(me));

export default router;