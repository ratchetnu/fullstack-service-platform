/**
 * Screenshot tooling only — never loaded by the application itself.
 *
 * Preloaded with `node --require` so a process believes it is 11:30 on the
 * next Tuesday in the business's time zone (US Eastern). The clock keeps
 * ticking from there. With the seed data generated at the same moment, every
 * screenshot shows the same kind of day: some jobs finished, one running,
 * one still to come.
 */
const RealDate = Date;
const DEMO_NOW = Number(process.env.DEMO_NOW);
if (!Number.isFinite(DEMO_NOW)) throw new Error("demo-clock.cjs needs DEMO_NOW (epoch milliseconds)");
const startedAt = RealDate.now();
const fakeNow = () => DEMO_NOW + (RealDate.now() - startedAt);

class DemoDate extends RealDate {
  constructor(...args) {
    if (args.length === 0) super(fakeNow());
    else super(...args);
  }
  static now() {
    return fakeNow();
  }
}

// Some runtimes look these up as own properties rather than through inheritance.
DemoDate.UTC = RealDate.UTC;
DemoDate.parse = RealDate.parse;

globalThis.Date = DemoDate;
