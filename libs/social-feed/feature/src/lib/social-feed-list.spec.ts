import { ComponentFixture, TestBed } from '@angular/core/testing';

import { beforeEach, describe, expect, it } from 'vitest';
import SocialFeedList from './social-feed-list';
describe('SocialFeedList', () => {
  let component: SocialFeedList;
  let fixture: ComponentFixture<SocialFeedList>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SocialFeedList],
    }).compileComponents();

    fixture = TestBed.createComponent(SocialFeedList);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
