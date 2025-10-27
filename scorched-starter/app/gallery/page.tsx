import Image from 'next/image';


const images = [
{ src: '/images/gallery-1.jpg', alt: 'Woodburning class' },
{ src: '/images/gallery-2.jpg', alt: 'Date night boards' },
{ src: '/images/gallery-3.jpg', alt: 'Corporate event' },
{ src: '/images/gallery-4.jpg', alt: 'Finished piece' },
];


export default function GalleryPage(){
return (
<section className="container-px py-20 max-w-6xl mx-auto">
<h1 className="text-4xl font-bold mb-6">Gallery</h1>
<p className="text-neutral-600 mb-10">A peek at what people make at Scorched Studio.</p>
<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
{images.map((img, i) => (
<div key={i} className="relative w-full h-64 rounded-xl overflow-hidden">
<Image src={img.src} alt={img.alt} fill className="object-cover" />
</div>
))}
</div>
</section>
);
}