import { useState } from 'react';
import { ArrowRight, CheckCircle, Database, GitBranch, Upload, Zap, Shield, Clock, ChevronDown, FileSpreadsheet, Globe, Sun, Moon, Monitor } from 'lucide-react';
import { Button, Card, CardContent, Input } from '@/components/ui';
import { Logo } from './Logo';
import { useTheme } from './ThemeProvider';

// Service logo URLs - using Simple Icons CDN where available, Google Favicons as fallback
const SERVICE_LOGOS: Record<string, { logo: string; type: 'svg' | 'favicon' }> = {
  // Simple Icons (SVG)
  'Stripe': { logo: 'https://cdn.simpleicons.org/stripe', type: 'svg' },
  'Paddle': { logo: 'https://cdn.simpleicons.org/paddle', type: 'svg' },
  'Salesforce': { logo: 'https://www.google.com/s2/favicons?domain=salesforce.com&sz=64', type: 'favicon' },
  'HubSpot': { logo: 'https://cdn.simpleicons.org/hubspot', type: 'svg' },
  'Zoho': { logo: 'https://cdn.simpleicons.org/zoho', type: 'svg' },
  'Braintree': { logo: 'https://cdn.simpleicons.org/braintree', type: 'svg' },
  'Adyen': { logo: 'https://cdn.simpleicons.org/adyen', type: 'svg' },
  'Square': { logo: 'https://cdn.simpleicons.org/square', type: 'svg' },
  'PayPal': { logo: 'https://cdn.simpleicons.org/paypal', type: 'svg' },
  'Shopify': { logo: 'https://cdn.simpleicons.org/shopify', type: 'svg' },
  'WooCommerce': { logo: 'https://cdn.simpleicons.org/woocommerce', type: 'svg' },
  'BigCommerce': { logo: 'https://cdn.simpleicons.org/bigcommerce', type: 'svg' },
  'PostgreSQL': { logo: 'https://cdn.simpleicons.org/postgresql', type: 'svg' },
  'MySQL': { logo: 'https://cdn.simpleicons.org/mysql', type: 'svg' },
  'MongoDB': { logo: 'https://cdn.simpleicons.org/mongodb', type: 'svg' },
  // Google Favicons (PNG) - for services not on Simple Icons
  'Chargebee': { logo: 'https://www.google.com/s2/favicons?domain=chargebee.com&sz=64', type: 'favicon' },
  'Recurly': { logo: 'https://www.google.com/s2/favicons?domain=recurly.com&sz=64', type: 'favicon' },
  'Zuora': { logo: 'https://www.google.com/s2/favicons?domain=zuora.com&sz=64', type: 'favicon' },
  'Pipedrive': { logo: 'https://www.google.com/s2/favicons?domain=pipedrive.com&sz=64', type: 'favicon' },
  'Magento': { logo: 'https://img.icons8.com/color/48/magento.png', type: 'favicon' },
};

// Component for service logo with fallback
function ServiceLogo({ name }: { name: string }) {
  const service = SERVICE_LOGOS[name];

  if (!service) {
    // Fallback icons for services without logos
    if (name === 'CSV/Excel') {
      return <FileSpreadsheet className="h-6 w-6 text-[hsl(var(--muted-foreground))]" />;
    }
    if (name === 'REST APIs') {
      return <Globe className="h-6 w-6 text-[hsl(var(--muted-foreground))]" />;
    }
    return null;
  }

  return (
    <img
      src={service.logo}
      alt={`${name} logo`}
      className="h-6 w-6"
      loading="lazy"
    />
  );
}

const SUPPORTED_SERVICES = [
  { category: 'Billing & Subscriptions', services: ['Stripe', 'Chargebee', 'Recurly', 'Zuora', 'Paddle'] },
  { category: 'CRM & Sales', services: ['Salesforce', 'HubSpot', 'Pipedrive', 'Zoho'] },
  { category: 'Payment Processing', services: ['Stripe', 'Braintree', 'Adyen', 'Square', 'PayPal'] },
  { category: 'E-commerce', services: ['Shopify', 'WooCommerce', 'BigCommerce', 'Magento'] },
  { category: 'Databases', services: ['PostgreSQL', 'MySQL', 'MongoDB', 'CSV/Excel', 'REST APIs'] },
];

const FEATURES = [
  {
    icon: Database,
    title: 'Schema-First Approach',
    description: 'Define your source and target schemas with field types, constraints, and relationships. Our intelligent system understands your data structure.',
  },
  {
    icon: GitBranch,
    title: 'Visual Mapping Builder',
    description: 'Create field mappings with drag-and-drop. Support for complex transforms, multi-source joins, and custom logic.',
  },
  {
    icon: Zap,
    title: '20+ Transform Types',
    description: 'Split names, map enums, format dates, concatenate fields, apply templates, and more. Handle any data transformation.',
  },
  {
    icon: Upload,
    title: 'Batch Processing',
    description: 'Upload CSV files or connect directly to APIs. Process thousands of records with progress tracking and error handling.',
  },
  {
    icon: Shield,
    title: 'Validation & Safety',
    description: 'Preview transformations before running. Catch errors early with schema validation and type checking.',
  },
  {
    icon: Clock,
    title: 'Pause & Resume',
    description: 'Long-running migrations can be paused and resumed. Never lose progress on large data transfers.',
  },
];

const TESTIMONIALS = [
  {
    quote: "We migrated 50,000 customers from Stripe to Chargebee in a weekend. SmoothExit's mapping tools saved us weeks of development.",
    author: "Sarah Chen",
    role: "CTO, TechStartup Inc",
  },
  {
    quote: "The multi-source join feature let us consolidate data from Salesforce and our legacy system in one migration.",
    author: "Marcus Johnson",
    role: "Head of Engineering, GrowthCo",
  },
];

export function LandingPage() {
  const { theme, setTheme } = useTheme();
  const [formData, setFormData] = useState({
    email: '',
    company: '',
    sourceService: '',
    targetService: '',
    estimatedRecords: '',
    notes: '',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      const response = await fetch('/api/migration-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      if (!response.ok) {
        throw new Error('Failed to submit request');
      }

      setIsSubmitted(true);
    } catch (err) {
      setError('Failed to submit. Please try again or email us directly.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const scrollToForm = () => {
    document.getElementById('request-form')?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div className="min-h-screen bg-[hsl(var(--background))]">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-[hsl(var(--background))]/80 backdrop-blur-md border-b border-[hsl(var(--border))]">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <Logo size="md" />
          <div className="flex items-center gap-4">
            <a href="/app" className="text-sm text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] transition-colors">
              Login
            </a>
            <Button onClick={scrollToForm}>
              Request Migration
            </Button>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="pt-32 pb-20 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[hsl(var(--primary))]/10 text-[hsl(var(--primary))] text-sm font-medium mb-6">
            <Zap className="h-4 w-4" />
            Schema-first data migration platform
          </div>
          <h1 className="text-5xl md:text-6xl font-bold tracking-tight mb-6">
            Migrate your data
            <span className="block text-[hsl(var(--primary))]">without the headache</span>
          </h1>
          <p className="text-xl text-[hsl(var(--muted-foreground))] mb-8 max-w-2xl mx-auto">
            SmoothExit makes it easy to move data between billing systems, CRMs, and databases.
            Define schemas, create mappings, and run migrations with confidence.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Button size="lg" onClick={scrollToForm}>
              Request a Migration
              <ArrowRight className="ml-2 h-5 w-5" />
            </Button>
            <Button variant="outline" size="lg" onClick={() => window.location.href = '/app'}>
              Try the App
            </Button>
          </div>
        </div>

        {/* Scroll indicator */}
        <div className="flex justify-center mt-16">
          <ChevronDown className="h-8 w-8 text-[hsl(var(--muted-foreground))] animate-bounce" />
        </div>
      </section>

      {/* Supported Services */}
      <section className="py-20 px-6 bg-[hsl(var(--muted))]/30">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-4">Works with your stack</h2>
          <p className="text-center text-[hsl(var(--muted-foreground))] mb-12 max-w-2xl mx-auto">
            Connect to popular billing systems, CRMs, databases, and more. We handle the complexity.
          </p>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {SUPPORTED_SERVICES.map((category) => (
              <Card key={category.category} className="bg-[hsl(var(--card))]">
                <CardContent className="pt-6">
                  <h3 className="font-semibold mb-4">{category.category}</h3>
                  <div className="flex flex-wrap gap-2">
                    {category.services.map((service) => (
                      <span
                        key={service}
                        className="inline-flex items-center gap-2.5 px-4 py-2 text-base rounded-lg bg-[hsl(var(--muted))] text-[hsl(var(--foreground))] hover:bg-[hsl(var(--muted))]/80 transition-colors"
                      >
                        <ServiceLogo name={service} />
                        {service}
                      </span>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-20 px-6">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-4">Everything you need for seamless migrations</h2>
          <p className="text-center text-[hsl(var(--muted-foreground))] mb-12 max-w-2xl mx-auto">
            Built by engineers who've done dozens of data migrations. We know what matters.
          </p>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {FEATURES.map((feature) => (
              <div key={feature.title} className="flex flex-col">
                <div className="h-12 w-12 rounded-lg bg-[hsl(var(--primary))]/10 flex items-center justify-center mb-4">
                  <feature.icon className="h-6 w-6 text-[hsl(var(--primary))]" />
                </div>
                <h3 className="text-lg font-semibold mb-2">{feature.title}</h3>
                <p className="text-[hsl(var(--muted-foreground))] text-sm">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="py-20 px-6 bg-[hsl(var(--muted))]/30">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-12">How it works</h2>
          <div className="space-y-8">
            {[
              { step: 1, title: 'Define Schemas', description: 'Create source and target schemas with field definitions. Import from existing APIs or define manually.' },
              { step: 2, title: 'Build Mappings', description: 'Map source fields to target fields. Apply transforms like name splitting, date formatting, or custom logic.' },
              { step: 3, title: 'Upload Data', description: 'Upload CSV files or connect to source APIs. Preview the transformation before running.' },
              { step: 4, title: 'Run Migration', description: 'Execute the migration with real-time progress tracking. Handle errors gracefully with detailed logs.' },
            ].map((item, index) => (
              <div key={item.step} className="flex gap-6 items-start">
                <div className="flex-shrink-0 h-12 w-12 rounded-full bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] flex items-center justify-center font-bold text-lg">
                  {item.step}
                </div>
                <div className="flex-1 pt-2">
                  <h3 className="text-lg font-semibold mb-1">{item.title}</h3>
                  <p className="text-[hsl(var(--muted-foreground))]">{item.description}</p>
                  {index < 3 && (
                    <div className="ml-6 mt-4 h-8 border-l-2 border-dashed border-[hsl(var(--border))]" />
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="py-20 px-6">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-12">Trusted by engineering teams</h2>
          <div className="grid md:grid-cols-2 gap-8">
            {TESTIMONIALS.map((testimonial, index) => (
              <Card key={index} className="bg-[hsl(var(--card))]">
                <CardContent className="pt-6">
                  <p className="text-lg mb-6 italic">"{testimonial.quote}"</p>
                  <div>
                    <p className="font-semibold">{testimonial.author}</p>
                    <p className="text-sm text-[hsl(var(--muted-foreground))]">{testimonial.role}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Request Form */}
      <section id="request-form" className="py-20 px-6 bg-[hsl(var(--muted))]/30">
        <div className="max-w-2xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-4">Request a Migration</h2>
          <p className="text-center text-[hsl(var(--muted-foreground))] mb-8">
            Tell us about your migration needs and we'll help you get started.
          </p>

          {isSubmitted ? (
            <Card className="bg-green-500/5 border-green-500/20">
              <CardContent className="py-12 text-center">
                <CheckCircle className="h-16 w-16 text-green-500 mx-auto mb-4" />
                <h3 className="text-xl font-semibold mb-2">Request Submitted!</h3>
                <p className="text-[hsl(var(--muted-foreground))]">
                  We'll review your migration requirements and get back to you within 24 hours.
                </p>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="pt-6">
                <form onSubmit={handleSubmit} className="space-y-6">
                  <div className="grid md:grid-cols-2 gap-4">
                    <Input
                      label="Email"
                      type="email"
                      required
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      placeholder="you@company.com"
                    />
                    <Input
                      label="Company"
                      required
                      value={formData.company}
                      onChange={(e) => setFormData({ ...formData, company: e.target.value })}
                      placeholder="Your company name"
                    />
                  </div>

                  <div className="grid md:grid-cols-2 gap-4">
                    <Input
                      label="Source Service"
                      required
                      value={formData.sourceService}
                      onChange={(e) => setFormData({ ...formData, sourceService: e.target.value })}
                      placeholder="e.g., Stripe, Salesforce, CSV"
                    />
                    <Input
                      label="Target Service"
                      required
                      value={formData.targetService}
                      onChange={(e) => setFormData({ ...formData, targetService: e.target.value })}
                      placeholder="e.g., Chargebee, HubSpot"
                    />
                  </div>

                  <Input
                    label="Estimated Number of Records"
                    value={formData.estimatedRecords}
                    onChange={(e) => setFormData({ ...formData, estimatedRecords: e.target.value })}
                    placeholder="e.g., 10,000 customers, 50,000 subscriptions"
                  />

                  <div>
                    <label className="block text-sm font-medium mb-2">Additional Notes</label>
                    <textarea
                      value={formData.notes}
                      onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                      placeholder="Tell us more about your migration needs, timeline, or any specific requirements..."
                      className="w-full h-32 px-3 py-2 rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] text-sm resize-none focus:outline-none focus:ring-2 focus:ring-[hsl(var(--primary))] focus:border-transparent"
                    />
                  </div>

                  {error && (
                    <p className="text-red-500 text-sm">{error}</p>
                  )}

                  <Button type="submit" className="w-full" size="lg" disabled={isSubmitting}>
                    {isSubmitting ? 'Submitting...' : 'Submit Request'}
                    <ArrowRight className="ml-2 h-5 w-5" />
                  </Button>
                </form>
              </CardContent>
            </Card>
          )}
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 px-6 border-t border-[hsl(var(--border))]">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <Logo size="sm" />
          <p className="text-sm text-[hsl(var(--muted-foreground))]">
            © {new Date().getFullYear()} SmoothExit. All rights reserved.
          </p>
          <div className="flex items-center gap-1 border border-[hsl(var(--border))] rounded-lg p-1">
              <button
                onClick={() => setTheme('light')}
                className={`p-1.5 rounded-md transition-colors ${theme === 'light' ? 'bg-[hsl(var(--muted))] text-[hsl(var(--foreground))]' : 'text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]'}`}
                title="Light mode"
              >
                <Sun className="h-4 w-4" />
              </button>
              <button
                onClick={() => setTheme('dark')}
                className={`p-1.5 rounded-md transition-colors ${theme === 'dark' ? 'bg-[hsl(var(--muted))] text-[hsl(var(--foreground))]' : 'text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]'}`}
                title="Dark mode"
              >
                <Moon className="h-4 w-4" />
              </button>
              <button
                onClick={() => setTheme('system')}
                className={`p-1.5 rounded-md transition-colors ${theme === 'system' ? 'bg-[hsl(var(--muted))] text-[hsl(var(--foreground))]' : 'text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]'}`}
                title="System theme"
              >
                <Monitor className="h-4 w-4" />
              </button>
          </div>
        </div>
      </footer>
    </div>
  );
}
