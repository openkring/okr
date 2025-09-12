import { ComponentFixture, TestBed } from '@angular/core/testing';

import { beforeEach, describe, expect, it } from 'vitest';
import SocialFeedFeatureComponent from './social-feed-list.component';
describe('SocialFeedFeatureComponent', () => {
  let component: SocialFeedFeatureComponent;
  let fixture: ComponentFixture<SocialFeedFeatureComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SocialFeedFeatureComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(SocialFeedFeatureComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
