import Hero from '@/components/sections/Hero';
import HowItWorks from '@/components/sections/HowItWorks';
import ScorchedIRL from '@/components/sections/ScorchedIRL';
import Pricing from '@/components/sections/Pricing';
import PastProjects from '@/components/sections/PastProjects';
import Hours from '@/components/sections/Hours';
import FAQ from '@/components/sections/FAQ';

export default function HomePage() {
  return (
    <>
      <Hero />
      <HowItWorks />    
      <Pricing />
      <Hours />
      <PastProjects />
      <FAQ />
      <ScorchedIRL /> 
    </>
  );
}
