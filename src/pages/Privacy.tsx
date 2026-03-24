import React from 'react';
import { LegalLayout } from '../components/layout/LegalLayout';

export const Privacy: React.FC = () => {
  return (
    <LegalLayout>
      <div className="prose prose-invert max-w-none">
        <h1 className="text-3xl font-bold text-white mb-2">Privacy Policy</h1>
        <p className="text-slate-400 text-sm mb-8">Last updated: {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</p>

        <div className="space-y-6 text-slate-300">
          <section>
            <h2 className="text-xl font-semibold text-white mt-8 mb-4">1. Introduction</h2>
            <p>
              Apex SEO ("we," "our," or "us") is committed to protecting your privacy. This Privacy Policy 
              explains how we collect, use, disclose, and safeguard your information when you use our Service.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mt-8 mb-4">2. Information We Collect</h2>
            
            <h3 className="text-lg font-semibold text-white mt-6 mb-3">2.1 Information You Provide</h3>
            <p>We collect information that you provide directly to us, including:</p>
            <ul className="list-disc list-inside ml-4 space-y-2 mt-2">
              <li><strong>Account Information:</strong> Email address, password, agency name, and business details</li>
              <li><strong>Profile Information:</strong> Business niche, country, timezone, and business description</li>
              <li><strong>Content:</strong> Website URLs, keywords, and content preferences</li>
              <li><strong>Payment Information:</strong> Processed securely through Stripe (we do not store credit card details)</li>
            </ul>

            <h3 className="text-lg font-semibold text-white mt-6 mb-3">2.2 Automatically Collected Information</h3>
            <p>We automatically collect certain information when you use our Service:</p>
            <ul className="list-disc list-inside ml-4 space-y-2 mt-2">
              <li>Usage data and analytics</li>
              <li>Device information and IP address</li>
              <li>Cookies and similar tracking technologies</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mt-8 mb-4">3. How We Use Your Information</h2>
            <p>We use the information we collect to:</p>
            <ul className="list-disc list-inside ml-4 space-y-2 mt-2">
              <li>Provide, maintain, and improve our Service</li>
              <li>Process transactions and send related information</li>
              <li>Send technical notices, updates, and support messages</li>
              <li>Respond to your comments, questions, and requests</li>
              <li>Monitor and analyze usage patterns and trends</li>
              <li>Detect, prevent, and address technical issues</li>
              <li>Generate AI-powered content based on your specifications</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mt-8 mb-4">4. Payment Processing</h2>
            <p>
              We use Stripe, a third-party payment processor, to handle all payment transactions. When you make 
              a payment, your payment information is processed directly by Stripe. We do not store or have access 
              to your full credit card details. Stripe's use of your personal information is governed by their 
              Privacy Policy, which can be viewed at{' '}
              <a href="https://stripe.com/privacy" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300 underline">
                https://stripe.com/privacy
              </a>.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mt-8 mb-4">5. Information Sharing and Disclosure</h2>
            <p>We do not sell, trade, or rent your personal information to third parties. We may share your information only in the following circumstances:</p>
            <ul className="list-disc list-inside ml-4 space-y-2 mt-2">
              <li><strong>Service Providers:</strong> With trusted third-party service providers who assist us in operating our Service (e.g., Stripe for payments, hosting providers)</li>
              <li><strong>Legal Requirements:</strong> When required by law or to protect our rights and safety</li>
              <li><strong>Business Transfers:</strong> In connection with a merger, acquisition, or sale of assets</li>
              <li><strong>With Your Consent:</strong> When you have given us explicit permission to share your information</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mt-8 mb-4">6. Data Security</h2>
            <p>
              We implement appropriate technical and organizational security measures to protect your personal 
              information against unauthorized access, alteration, disclosure, or destruction. However, no method 
              of transmission over the Internet or electronic storage is 100% secure, and we cannot guarantee 
              absolute security.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mt-8 mb-4">7. Data Retention</h2>
            <p>
              We retain your personal information for as long as necessary to provide the Service and fulfill 
              the purposes outlined in this Privacy Policy, unless a longer retention period is required or 
              permitted by law. When you cancel your account, we will delete or anonymize your personal 
              information, except where we are required to retain it for legal or business purposes.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mt-8 mb-4">8. Your Rights</h2>
            <p>Depending on your location, you may have certain rights regarding your personal information:</p>
            <ul className="list-disc list-inside ml-4 space-y-2 mt-2">
              <li><strong>Access:</strong> Request access to your personal information</li>
              <li><strong>Correction:</strong> Request correction of inaccurate information</li>
              <li><strong>Deletion:</strong> Request deletion of your personal information</li>
              <li><strong>Portability:</strong> Request transfer of your data to another service</li>
              <li><strong>Opt-out:</strong> Unsubscribe from marketing communications</li>
            </ul>
            <p className="mt-3">
              To exercise these rights, please contact us at support@apex-seo.app.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mt-8 mb-4">9. Cookies and Tracking Technologies</h2>
            <p>
              We use cookies and similar tracking technologies to track activity on our Service and store 
              certain information. You can instruct your browser to refuse all cookies or to indicate when 
              a cookie is being sent. However, if you do not accept cookies, you may not be able to use 
              some portions of our Service.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mt-8 mb-4">10. Children's Privacy</h2>
            <p>
              Our Service is not intended for individuals under the age of 18. We do not knowingly collect 
              personal information from children. If you become aware that a child has provided us with 
              personal information, please contact us immediately.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mt-8 mb-4">11. International Data Transfers</h2>
            <p>
              Your information may be transferred to and maintained on computers located outside of your 
              state, province, country, or other governmental jurisdiction where data protection laws may 
              differ. By using our Service, you consent to the transfer of your information to our facilities 
              and those third parties with whom we share it as described in this Privacy Policy.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mt-8 mb-4">12. Changes to This Privacy Policy</h2>
            <p>
              We may update our Privacy Policy from time to time. We will notify you of any changes by posting 
              the new Privacy Policy on this page and updating the "Last updated" date. You are advised to 
              review this Privacy Policy periodically for any changes.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mt-8 mb-4">13. Contact Us</h2>
            <p>
              If you have any questions about this Privacy Policy, please contact us at:
            </p>
            <p className="mt-2">
              Email: support@apex-seo.app<br />
              Address: 123 Business Street, Suite 100, City, State 12345, United States
            </p>
          </section>
        </div>
      </div>
    </LegalLayout>
  );
};
