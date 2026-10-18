const focus = "min-h-6 rounded-lg border border-zinc-300 px-3 py-2 text-sm";

const GENDER = [["prefer_not", "Prefer not to say"], ["woman", "Woman"], ["man", "Man"], ["non_binary", "Non-binary"]];
const AGE = [["prefer_not", "Prefer not to say"], ["under_25", "Under 25"], ["25_34", "25–34"], ["35_44", "35–44"], ["45_plus", "45 or older"]];
const DISABILITY = [["prefer_not", "Prefer not to say"], ["yes", "Yes"], ["no", "No"]];

export function SelfIdForm(input: { action: string; saved: boolean }) {
  return (
    <section className="mt-8" aria-labelledby="self-id-heading">
      <h2 id="self-id-heading" className="text-lg font-bold">Optional self-identification</h2>
      <p className="mt-2 text-sm text-zinc-800">
        This is separate from your application. Recruiters do not see it, and it is not used to score or rank you. Every field starts at “Prefer not to say”.
      </p>
      {input.saved ? <p className="mt-2 text-sm">Saved. You can delete it whenever you want.</p> : null}
      <form className="mt-4 space-y-3" method="post" action={input.action}>
        <input type="hidden" name="intent" value="save" />
        <label className="block text-sm font-semibold" htmlFor="self-gender">Gender</label>
        <select id="self-gender" name="gender" defaultValue="prefer_not" className={focus}>
          {GENDER.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
        <label className="block text-sm font-semibold" htmlFor="self-age">Age band</label>
        <select id="self-age" name="ageBand" defaultValue="prefer_not" className={focus}>
          {AGE.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
        <label className="block text-sm font-semibold" htmlFor="self-disability">Disability</label>
        <select id="self-disability" name="disability" defaultValue="prefer_not" className={focus}>
          {DISABILITY.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
        <label className="block text-sm font-semibold" htmlFor="self-region">Region or state</label>
        <input id="self-region" name="region" defaultValue="" placeholder="Prefer not to say" className={focus} />
        <button className={focus} type="submit">Save self-identification</button>
      </form>
      <form className="mt-3" method="post" action={input.action}>
        <input type="hidden" name="intent" value="delete" />
        <button className={focus} type="submit">Delete my self-identification</button>
      </form>
    </section>
  );
}
