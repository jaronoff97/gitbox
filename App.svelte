<script lang="ts">
	let confirmed = $state(false);
</script>

<div class="app">
	<div class="btn" testId="confirm" onclick={() => (confirmed = true)}>
		{confirmed ? 'It works' : 'Confirm'}
	</div>
</div>

<style>
	.app {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 100%;
		height: 100%;
		background-color: #11111b;
	}
	.btn {
		padding: 12px 24px;
		border-radius: 8px;
		background-color: #a6e3a1;
		color: #1e1e2e;
		font-weight: bold;
		cursor: pointer;
	}
	.btn:hover {
		background-color: #94e2d5;
	}
</style>
