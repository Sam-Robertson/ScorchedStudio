import Container from './ui/Container';


export default function Footer(){
return (
<footer className="mt-24 border-t">
<Container className="py-10 text-sm text-neutral-600">
<div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
<p>© {new Date().getFullYear()} Scorched Studio · 218 E University Pkwy, Orem, UT 84058</p>
<p>
<a href="/sitemap.xml" className="underline">Sitemap</a>
</p>
</div>
</Container>
</footer>
);
}