export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header style={{ padding: '20px', backgroundColor: '#0070f3', color: '#fff', textAlign: 'center' }}>
          <h1>DancePerfect</h1>
        </header>

        <main style={{ minHeight: '80vh', padding: '20px' }}>{children}</main>

        <footer style={{ padding: '20px', backgroundColor: '#f1f1f1', textAlign: 'center' }}>
          &copy; 2025 DancePerfect. All rights reserved.
        </footer>
      </body>
    </html>
  );
}
