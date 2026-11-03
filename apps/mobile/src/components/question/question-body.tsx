import { ClozeBody } from './cloze'
import { MultipleChoiceBody } from './mcq'
import { MultiBody } from './multi'
import { NeedsUpdate } from './needs-update'
import { OrderBody } from './order'
import { ShortBody } from './short'
import type { QuestionBodyProps } from './types'

export function QuestionBody(props: QuestionBodyProps) {
  switch (props.item.format) {
    case 'mcq': return <MultipleChoiceBody {...props} />
    case 'cloze': return <ClozeBody {...props} />
    case 'multi': return <MultiBody {...props} />
    case 'order': return <OrderBody {...props} />
    case 'short': return <ShortBody {...props} />
    default: return <NeedsUpdate />
  }
}
