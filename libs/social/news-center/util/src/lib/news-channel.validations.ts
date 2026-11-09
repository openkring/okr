import { enforce, staticSuite, test } from 'vest';

export const NEWS_CHANNEL_NAME_MAX_LENGTH = 80;

/** What the webcam edit form edits (design 2026-11-09 §5.3). `orgName` is display only. */
export interface NewsChannelFormData {
  name: string;
  latitude: number;
  longitude: number;
  orgKey: string;
  orgName: string;
}

const V = '@social/news-center/util.validation.';

export const newsChannelValidations = staticSuite((model: NewsChannelFormData) => {
  test('name', V + 'nameRequired', () => {
    enforce((model.name ?? '').trim()).isNotEmpty();
  });
  test('name', V + 'nameTooLong', () => {
    enforce((model.name ?? '').length).lessThanOrEquals(NEWS_CHANNEL_NAME_MAX_LENGTH);
  });
});
