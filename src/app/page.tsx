import { Footer } from '@/components/landing/Footer';
import { Header } from '@/components/landing/Header';
import { Hero } from '@/components/landing/Hero';
import { Features } from '@/components/landing/Features';
import { Steps } from '@/components/landing/Steps';
import { ContactForm } from '@/components/landing/ContactForm';

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background selection:bg-primary/20 selection:text-primary">
      <Header />
      <main>
        <Hero />
        <Features />
        <Steps />
        <ContactForm />
      </main>
      <Footer />
    </div>
  );
}
