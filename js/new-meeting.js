/**
 * "New meeting" pop-up: asks for a title and context, then opens the live page.
 */
const NewMeetingDialog = {

  open() {
    if (Live.running) {
      showToast('End the current meeting first.');
      return;
    }
    $('#new-title').value = '';
    $('#new-context').value = '';
    $('#new-error').textContent = '';
    $('#new-dialog').showModal();
    $('#new-title').focus();
  },

  close() {
    $('#new-dialog').close();
  },

  async create() {
    const title   = $('#new-title').value.trim();
    const context = $('#new-context').value.trim();

    if (!title) {
      $('#new-error').textContent = 'Enter a meeting title to continue.';
      return;
    }

    const button = $('#new-create');
    button.disabled = true;
    try {
      const meeting = await Api.createMeeting(title, context);
      this.close();
      Live.setup(meeting);
    } catch (error) {
      $('#new-error').textContent = 'Could not create the meeting. Check that the backend is running.';
    }
    button.disabled = false;
  },

  init() {
    $$('[data-action="new-meeting"]').forEach((button) => {
      button.onclick = () => this.open();
    });
    $('#new-cancel').onclick = () => this.close();
    $('#new-create').onclick = () => this.create();
  },
};