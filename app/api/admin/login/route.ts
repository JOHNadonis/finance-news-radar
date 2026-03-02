import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { getAdminConfig, setAdminConfig } from "@/lib/db";

export async function POST(req: NextRequest) {
  try {
    const { password } = await req.json();
    if (!password || typeof password !== "string") {
      return NextResponse.json({ ok: false, error: "密码不能为空" }, { status: 400 });
    }

    // On first use: hash the env password and store it
    let storedHash = getAdminConfig("password_hash");
    if (!storedHash) {
      const envPwd = process.env.ADMIN_PASSWORD;
      if (!envPwd) {
        return NextResponse.json(
          { ok: false, error: "未设置 ADMIN_PASSWORD 环境变量" },
          { status: 500 }
        );
      }
      storedHash = await bcrypt.hash(envPwd, 10);
      setAdminConfig("password_hash", storedHash);
    }

    // Verify password
    const valid = await bcrypt.compare(password, storedHash);
    if (!valid) {
      return NextResponse.json({ ok: false, error: "密码错误" }, { status: 401 });
    }

    // Generate session token
    const token = crypto.randomBytes(32).toString("hex");
    const expires = Date.now() + 24 * 60 * 60 * 1000; // 24h
    setAdminConfig("session_token", token);
    setAdminConfig("session_expires", String(expires));

    // Set cookie
    const res = NextResponse.json({ ok: true });
    res.cookies.set("admin_token", token, {
      httpOnly: true,
      path: "/",
      maxAge: 24 * 60 * 60, // 24h in seconds
      sameSite: "lax",
    });

    return res;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
