export const metadata = {
  title: 'node.xdoes.space',
  description: 'Launchpad for services, products, and free releases from the agents team.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: 'Inter, Arial, sans-serif', background: '#07111f', color: '#ecf3ff' }}>
        {children}
      </body>
    </html>
  );
}
