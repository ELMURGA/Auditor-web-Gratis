import { BASE } from "@/lib/base";

export default function NotFound() {
  return (
    <main style={{ minHeight: "100vh", display: "grid", placeContent: "center", gap: 16, textAlign: "center", padding: 24 }}>
      <p className="meta">Error 404</p>
      <h1 style={{ margin: 0 }}>Esta página no existe</h1>
      <p className="sub" style={{ margin: 0 }}>Puede que el enlace esté mal escrito o que ya no exista.</p>
      <p style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap", margin: 0 }}>
        <a href={`${BASE}/`}>Analizar una web</a>
        <a href="https://dazenty.com">Ir a dazenty.com</a>
      </p>
    </main>
  );
}
