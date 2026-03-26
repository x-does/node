export async function GET() {
  return Response.json({
    ok: true,
    service: 'node.xdoes.space',
    framework: 'nextjs',
    timestamp: new Date().toISOString(),
  });
}
