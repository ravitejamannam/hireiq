"use client";

type CodingTestFormProps = {

  onCancel: () => void;

};

export default function CodingTestForm({ onCancel }: CodingTestFormProps) {
  return (
    <form className="space-y-6">
      <input
        placeholder="Test Title"
        className="w-full rounded-lg border border-zinc-300 px-4 py-3 text-black"
      />

      <input
        placeholder="Candidate"
        className="w-full rounded-lg border border-zinc-300 px-4 py-3 text-black"
      />

      <input
        placeholder="Company"
        className="w-full rounded-lg border border-zinc-300 px-4 py-3 text-black"
      />

      <input
        placeholder="Difficulty"
        className="w-full rounded-lg border border-zinc-300 px-4 py-3 text-black"
      />

      <input
        placeholder="Status"
        className="w-full rounded-lg border border-zinc-300 px-4 py-3 text-black"
      />

      <div className="flex justify-end gap-3">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-zinc-300 text-black px-5 py-3"
        >
          Cancel
        </button>

        <button
          type="submit"
          className="rounded-lg bg-black px-5 py-3 text-white"
        >
          Create Coding Test
        </button>
      </div>
    </form>
  );
}
