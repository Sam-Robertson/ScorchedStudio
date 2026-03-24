// app/api/admin/verify/route.ts
export async function POST(req: Request) {
  try {
    const { password } = await req.json();
    if (!password || password !== process.env.ADMIN_PASSWORD) {
      return Response.json({ error: "Invalid password" }, { status: 401 });
    }
    return Response.json({ token: password });
  } catch {
    return Response.json({ error: "Bad request" }, { status: 400 });
  }
}
