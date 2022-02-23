interface Rule {
  value?: string;
  tag?: string;
  [key: string]: string;
}

interface InstantatedRule extends Rule{
  id: string;
}

interface InstantatedRulesResponse {
  data?: InstantatedRule[];
  meta: { 
    sent: string; // timestamp, e.g. '2021-03-17T12:33:40.130Z'
  };
}

interface DeletedRulesResponse {
  meta: { 
    sent: string; // timestamp, e.g. '2021-03-17T12:33:40.130Z'
    summary: {
      deleted: number;      // e.g. 2
      not_deleted: number;  // e.g. 0
    }
  };
}

interface SetRulesResponse {
  data: InstantatedRule[ ],
  meta: {
    sent: string; // e.g. '2021-03-17T12:40:05.919Z',
    summary: {
      created: number; // 2,
      not_created: number; // 0,
      valid: number; // 2,
      invalid: number; // 0
    }
  }
}

interface MatchingRule {
  id: number;  // e.g. 1372169037657092000
  tag: string; // e.g. 'dog pictures'
}

interface MatchingTweet {
    data: {
      id: string; // e.g. '1372169199481724928',
      text: string;// e.g.  'la superioridad estética del schnauzer es innegable https://t.co/wNtv7TTnuT'
    },
    matching_rules: MatchingRule[ ];
}

interface Tweet {
  created_at: string; // '2021-03-20T09:57:50.000Z',
  author_id: string;  // '2021-03-20T09:57:50.000Z',
  id: string;         // '1373212177428004864',
  text: string;
}