# Koordi: Optional Payment Implementation Research

**Date:** November 26, 2025
**Prepared for:** James Schaffer
**Purpose:** Product marketing analysis for implementing optional user payments

---

## Executive Summary

For your $5-15 "fund utility" price point, I recommend **Stripe Payment Links** as the primary implementation with **"Support Koordi"** as the messaging. This gives you zero platform fees (only standard Stripe processing ~2.9% + $0.30), future flexibility for subscriptions, and professional positioning that matches your app's quality.

---

## Part 1: The Terminology Question

### Is "Donation" the Right Word?

**No, and here's why:**

1. **Legal/Tax Implications**: "Donation" technically refers to gifts to non-profit organizations or charities. Using this term for a for-profit software project creates confusion and potential tax complications. The more accurate term would be "gratuity" (tip), which is considered taxable income.

2. **Psychological Framing**: "Donation" implies charity—users might wonder "what cause am I supporting?" rather than "I'm paying for value received."

3. **User Expectation Mismatch**: People expect donations to go toward a greater cause, not to fund utility software they use.

### Better Alternatives (Ranked by Recommendation)

| Term | Pros | Cons | Best For |
|------|------|------|----------|
| **"Support Koordi"** | Professional, clear value exchange, implies ongoing relationship | Slightly less casual | Utility apps, professional tools |
| **"Support this project"** | Developer-friendly, honest | Can feel impersonal | Open source, side projects |
| **"Buy me a coffee"** | Friendly, low-pressure, familiar | Overused, feels trivial at $10+ | Indie content, small tools |
| **"Tip jar"** | Casual, familiar | Too casual for utility software, implies optional gratuity for free service | Streamers, newsletters |
| **"Pay what you want"** | Transparent, empowering | Average payments are very low (~$0.92) | Music, creative content |

### My Recommendation: **"Support Koordi"**

**Why this works for your use case:**
- **Matches the value proposition**: Users aren't tipping for entertainment—they're supporting a tool that saves them time coordinating family logistics
- **Appropriate for $5-15 range**: "Buy me a coffee" feels weird at $10+; "Support" scales naturally
- **Future-proof**: Works whether you're asking for one-time support or later transition to subscriptions
- **Professional but approachable**: Doesn't sound corporate, but also doesn't trivialize the value

---

## Part 2: Platform Comparison

### Option A: Stripe Payment Links (RECOMMENDED)

**What it is:** A no-code payment page hosted by Stripe that you link to from your app.

**Implementation:**
- Create product/price in Stripe Dashboard
- Get shareable link
- Add button to your nav that opens link in new tab
- ~30 minutes total setup

**Fees:**
- Platform fee: **0%**
- Payment processing: **2.9% + $0.30 per transaction**
- On a $10 payment: You keep **$9.41** (94.1%)

**Pros:**
- Lowest total fees
- Already industry-standard (you likely have Stripe eventually anyway)
- Full control over branding and experience
- Easy upgrade path to subscriptions, customer portal, invoicing
- Real customer data in your Stripe dashboard
- No third-party brand on your checkout

**Cons:**
- Slightly more setup than BMC
- No built-in social proof/community features

**Best for you because:** You're building a serious utility app, not a side blog. Stripe positions you professionally and gives you ownership of the customer relationship.

---

### Option B: Buy Me a Coffee

**What it is:** Popular creator economy platform with embeddable widgets and hosted pages.

**Implementation:**
- Create account
- Customize page
- Add button/widget to your nav
- ~15 minutes setup

**Fees:**
- Platform fee: **5%**
- Payment processing (Stripe): **2.9% + $0.30**
- Payout fee: **0.5%**
- International: **+1%**
- On a $10 payment: You keep **~$8.52** (85.2%)

**Pros:**
- Extremely easy setup
- Built-in supporter page with messages
- Familiar to many users
- Supports recurring memberships
- Widget/button options

**Cons:**
- ~14% higher effective fees than Stripe direct
- Third-party brand on your checkout
- You don't own the customer relationship
- Limited customization
- PayPal no longer supported in US

**Best for:** Content creators, bloggers, streamers, open source projects with casual audiences

---

### Option C: Ko-fi

**What it is:** Similar to Buy Me a Coffee but with zero platform fees on one-time donations.

**Implementation:** Same as BMC

**Fees:**
- Platform fee: **0%** (on one-time "coffees")
- Payment processing: **2.9% + $0.30**
- On a $10 payment: You keep **$9.41** (94.1%)

**Pros:**
- Same fees as Stripe direct
- Supports PayPal (unlike BMC)
- Free to use
- Commission-free shop for digital goods

**Cons:**
- Less polished than BMC
- Still third-party branding
- Less mainstream recognition
- Platform fees apply for subscriptions and other features

**Best for:** Creators who want BMC-style experience without platform fees

---

### Option D: LiberaPay

**What it is:** Non-profit, open-source platform focused on recurring donations for creators.

**Fees:**
- Platform fee: **0%**
- Payment processing: Varies by payment method

**Pros:**
- Zero platform fees
- Open source ethos
- Good for recurring support

**Cons:**
- Less mainstream
- Focuses on recurring, not one-time
- Less polished UX
- Smaller user base

---

### Fee Comparison Summary

| Platform | $5 Payment (You Keep) | $10 Payment (You Keep) | $15 Payment (You Keep) |
|----------|----------------------|------------------------|------------------------|
| **Stripe Direct** | $4.56 (91%) | $9.41 (94%) | $14.27 (95%) |
| **Ko-fi** | $4.56 (91%) | $9.41 (94%) | $14.27 (95%) |
| **Buy Me a Coffee** | $4.01 (80%) | $8.52 (85%) | $13.03 (87%) |

**Verdict:** At your price points, you're losing **$0.50-$1.25 per transaction** with Buy Me a Coffee compared to Stripe direct. Over hundreds of supporters, this adds up significantly.

---

## Part 3: Implementation Recommendations

### Easiest Implementation: Buy Me a Coffee

**Time to implement:** 15-30 minutes

```
1. Create BMC account
2. Set up your page (name, description, "coffee" price)
3. Add button to navbar using their widget code
4. Done
```

**But I don't recommend this** because the fee structure eats into your modest price point, and you lose the professional positioning.

---

### Best Implementation: Stripe Payment Links

**Time to implement:** 30-60 minutes

**Step-by-step:**

1. **Create Stripe Account** (if you don't have one)
   - Go to dashboard.stripe.com
   - Complete business verification

2. **Create Product**
   - Products → Add Product
   - Name: "Support Koordi"
   - Description: "Help fund continued development of Koordi"

3. **Create Price Options** (consider multiple tiers)
   - $5 - "Coffee" tier
   - $10 - "Support" tier (highlight this as default)
   - $15 - "Patron" tier

4. **Generate Payment Link**
   - Payment Links → Create
   - Select your product
   - Customize confirmation page
   - Optional: Let customer adjust quantity

5. **Add to Your App**
   ```tsx
   // Simple navbar button
   <Button
     variant="outline"
     onClick={() => window.open('https://buy.stripe.com/your-link', '_blank')}
   >
     Support Koordi
   </Button>
   ```

6. **Optional Enhancements**
   - Add thank-you page redirect
   - Track conversions with Stripe webhooks
   - Send thank-you emails

---

### Future-Proof Implementation: Stripe with Custom Integration

If you want to upgrade later to subscriptions, metered billing, or premium features:

**Phase 1 (Now):** Payment Links for one-time support
**Phase 2 (Later):** Add Stripe Checkout for subscriptions
**Phase 3 (Future):** Customer portal, premium tier, etc.

All of this stays within Stripe's ecosystem, so your customer data and payment methods carry over seamlessly.

---

## Part 4: Pricing Psychology

### Research Insights

1. **Pay-What-You-Want averages are LOW**: Studies show PWYW averages around $0.92. However, when tied to a cause (even just "support the developer"), this jumps to $5-6.50 average.

2. **Suggested amounts matter**: Don't leave it open-ended. Provide 3 clear options. The middle option typically gets chosen most.

3. **Anchoring effect**: If you show $5 / **$10** / $15, most people pick $10. If you only show $5 and $10, most pick $5.

4. **"Buy me a coffee" ceiling**: The coffee metaphor breaks down above ~$7. A $15 "coffee" feels wrong. "Support" scales better.

5. **Social proof increases payments**: "Join 47 supporters" or showing recent support boosts both conversion and average amount.

### Recommended Pricing Tiers

| Tier | Price | Label | Psychology |
|------|-------|-------|------------|
| Entry | $5 | "Grab a coffee" | Low friction entry point |
| **Default** | $10 | "Support the project" | Highlighted, center position |
| Generous | $15 | "Become a patron" | For superfans |

**Highlight the $10 tier** as the "recommended" or default option. This anchors expectations and most users will select it.

---

## Part 5: Communication Strategy

### Where to Place the Button

**Primary:** Navigation bar (subtle but always visible)
- Consider: Right side of nav, before profile/settings
- Style: Secondary/outline button, not attention-grabbing

**Secondary:** Settings page
- "Enjoying Koordi? Consider supporting continued development."
- More room for messaging here

**Avoid:** Intrusive popups, frequent prompts, or guilt-based messaging

### Copy Recommendations

**Button text:**
- Primary: `Support Koordi` or `Support`
- With icon: `❤️ Support` or `☕ Support`

**Support page headline:**
```
Support Koordi Development

Koordi is built and maintained by a solo developer.
If it's saved you time coordinating your family's activities,
consider buying me a coffee (or three).
```

**Key messaging principles:**
1. **Value-first**: Lead with what they've gained, not what you need
2. **Transparency**: "Solo developer" / "side project" builds connection
3. **No guilt**: Never say "please" or imply obligation
4. **Concrete impact**: "Covers hosting costs" or "Funds new features"

### Sample Support Page Copy

```markdown
# Support Koordi

Koordi helps families coordinate kids' activities without the chaos.
If it's made your life a little easier, consider supporting continued development.

## What Your Support Funds
- Server and hosting costs
- API integrations (Google Calendar, Maps)
- New features and improvements
- Bug fixes and maintenance

## Support Tiers

☕ **$5** - Thanks for the coffee!
🙌 **$10** - You're helping keep the lights on
🎉 **$15** - You're officially a patron

Every contribution—big or small—helps keep Koordi running and improving.

[Support Koordi →]
```

---

## Part 6: Final Recommendations

### Summary Decision Matrix

| Factor | Stripe Payment Links | Buy Me a Coffee | Ko-fi |
|--------|---------------------|-----------------|-------|
| **Setup Time** | 30-60 min | 15 min | 20 min |
| **Fees at $10** | 5.9% | ~15% | 5.9% |
| **Professional Look** | ★★★★★ | ★★★☆☆ | ★★★☆☆ |
| **Future Flexibility** | ★★★★★ | ★★☆☆☆ | ★★☆☆☆ |
| **User Recognition** | ★★★☆☆ | ★★★★★ | ★★★☆☆ |
| **You Own Customer Data** | ✅ | ❌ | ❌ |

### My Top Recommendation

**Go with Stripe Payment Links** with these specifics:

1. **Terminology:** "Support Koordi" (not donation, tip, or coffee)
2. **Pricing:** $5 / $10 (default) / $15 tiers
3. **Placement:** Subtle nav bar button, detailed info in Settings
4. **Messaging:** Value-first, transparent, no guilt

### Quick Implementation Path

```
Day 1:
├── Create Stripe account (if needed)
├── Create product with 3 price tiers
├── Generate payment link
└── Add button to nav bar

Day 2:
├── Add support info section to Settings page
├── Test payment flow
└── Go live
```

---

## Sources

- [Stripe Payment Links Documentation](https://docs.stripe.com/payment-links)
- [Buy Me a Coffee Fee Structure](https://help.buymeacoffee.com/en/articles/8105744-how-to-calculate-charges-on-your-payment)
- [Buy Me a Coffee Alternatives Comparison](https://wpforms.com/best-buy-me-a-coffee-alternatives/)
- [Ko-Fi Alternatives for Tips and Donations](https://selar.com/blog/ko-fi-alternatives/)
- [Pay What You Want Pricing Psychology](https://en.wikipedia.org/wiki/Pay_what_you_want)
- [Pricing Experiments Research](https://cxl.com/blog/pricing-experiments-you-might-not-know-but-can-learn-from/)
- [Consumer Psychology Behind PWYW](https://fastercapital.com/content/Consumer-Psychology--Understanding-the-Science-Behind-Pay-What-You-Want-Pricing.html)
- [Donate Button Best Practices](https://www.funraise.org/blog/donate-button-guide)
- [Ghost vs Buy Me a Coffee](https://ghost.org/vs/buymeacoffee/)

---

*This research was compiled to help make an informed decision about implementing optional payments for Koordi. The recommendations prioritize long-term flexibility, professional positioning, and maximizing value retained from each transaction.*
