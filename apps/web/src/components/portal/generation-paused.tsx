import { Banner } from '@/components/admin/banner'

// Company generation waits for an official model path; training that is already built keeps working.
export function GenerationPausedBanner() {
  return (
    <Banner>
      <strong>Training generation is paused.</strong> New curricula, questions and procedure flowcharts wait until an official model path exists. Existing training, people and progress keep working.
    </Banner>
  )
}
