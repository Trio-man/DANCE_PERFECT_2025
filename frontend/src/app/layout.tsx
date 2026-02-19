import './globals.css';

export const metadata = {
  title: 'DancePerfect',
  description: 'Markerless motion capture dance analysis app',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className="min-h-screen bg-white text-slate-800"
        suppressHydrationWarning
      >
        {children}
      </body>
    </html>
  );
}
